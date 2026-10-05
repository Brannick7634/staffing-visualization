"""Offline safety tests. ALL publishing is mocked; no network or real credentials."""
import calendar
import copy
import contextlib
import io
import json
import os
import sys
import tempfile
import unittest
from datetime import date, datetime
from pathlib import Path
from unittest.mock import patch
from urllib import error
import daily_social as s

TODAY = date(2026, 10, 5)


def cell(role='welder', cents=2800, n=40):
    return dict(roleKey=role, level='nationwide', state=None, city=None, n=n,
                p25Cents=cents-200, typicalCents=cents, p75Cents=cents+200,
                checks=dict(status='verified', distinctFirms=8, maxFirmShare=.2))


def document(month='2026-09', cents=2800):
    """Synthetic values. Never use these documents as production input."""
    first = date.fromisoformat(month+'-01')
    last = first.replace(day=calendar.monthrange(first.year, first.month)[1])
    return dict(format=s.FORMAT, schemaVersion=1, calcVersion='signal-month-1.0.0',
                baseCalcVersion='signal-agg-1.1.0', month=month,
                period=dict(start=first.isoformat(), end=last.isoformat()),
                generatedAt='2026-10-05T01:00:00Z', sourceBuiltAt='2026-10-02 19:28:49',
                collectionStart='2026-07-01', reliability=dict(reliable=True),
                method=dict(payValue='hourly_mid per posting; travel weekly packages excluded',
                            quantile="statistics.quantiles(n=4, method='exclusive'); typical = median"),
                pay=[cell(cents=cents), cell('registered-nurse',5000)],
                totals=dict(postings=10000),
                demand=dict(states=[dict(code='CA',postings=2000,
                                        checks=dict(status='verified',distinctFirms=100,maxFirmShare=.1))]))


class ValidationTests(unittest.TestCase):
    def setUp(self):
        self.cur, self.prev = document(), document('2026-08', 2400)

    def test_valid_document(self):
        self.assertIs(s.validate_doc(self.cur,TODAY),self.cur)

    def test_privacy_boundary_exactly_five_and_half(self):
        self.assertTrue(s.privacy(dict(status='verified',distinctFirms=5,maxFirmShare=.5)))

    def test_privacy_rejects_missing_unverified_low_count_concentration_nan_bool(self):
        for checks in (None,{},dict(status='not_verified',distinctFirms=10,maxFirmShare=.1),
                       dict(status='verified',distinctFirms=4,maxFirmShare=.1),
                       dict(status='verified',distinctFirms=10,maxFirmShare=.501),
                       dict(status='verified',distinctFirms=10,maxFirmShare=float('nan')),
                       dict(status='verified',distinctFirms=True,maxFirmShare=.1)):
            with self.subTest(checks=checks): self.assertFalse(s.privacy(checks))

    def test_reject_unreviewed_method(self):
        self.cur['method']['payValue']='weekly travel total'
        with self.assertRaisesRegex(s.Hold,'unreviewed_pay_basis'): s.validate_doc(self.cur,TODAY)

    def test_reject_future_period(self):
        with self.assertRaisesRegex(s.Hold,'incomplete_or_invalid_period'):
            s.validate_doc(document('2026-10'),TODAY)

    def test_reject_period_mismatch(self):
        self.cur['period']['end']='2026-09-29'
        with self.assertRaises(s.Hold): s.validate_doc(self.cur,TODAY)

    def test_reject_source_staleness(self):
        self.cur['sourceBuiltAt']='2026-09-20 00:00:00'
        with self.assertRaisesRegex(s.Hold,'stale_or_future_source'): s.validate_doc(self.cur,TODAY)

    def test_reject_future_export(self):
        self.cur['generatedAt']='2026-10-06T00:00:00Z'
        with self.assertRaises(s.Hold): s.validate_doc(self.cur,TODAY)

    def test_reject_unknown_calculation_version(self):
        self.cur['calcVersion']='new-unreviewed-version'
        with self.assertRaises(s.Hold): s.validate_doc(self.cur,TODAY)

    def test_reject_duplicate_national_cell(self):
        self.cur['pay'].append(copy.deepcopy(self.cur['pay'][0]))
        with self.assertRaisesRegex(s.Hold,'ambiguous'): s.validate_doc(self.cur,TODAY)

    def test_reject_too_small_or_invalid_pay(self):
        cases = [cell(n=29),cell(cents=0)]
        c=cell(); c['p25Cents']=999999; cases.append(c)
        c=cell(); c['checks']['distinctFirms']=100; cases.append(c)
        c=cell(); c['typicalCents']=True; cases.append(c)
        for c in cases: self.assertFalse(s.valid_pay(c))

    def test_no_local_pay_leaks(self):
        c=cell(); c.update(level='state',state='GA')
        self.assertFalse(s.valid_pay(c))

    def test_excludes_non_target_role(self):
        self.assertFalse(s.valid_pay(cell('software-engineer')))

    def test_missing_previous_month_falls_back_to_snapshots(self):
        items,warnings=s.candidates(self.cur,None,TODAY)
        self.assertTrue(items)
        self.assertTrue(warnings)
        self.assertEqual({x['kind'] for x in items},{'pay_spotlight'})

    def test_august_collection_metadata_conflict_blocks_trends(self):
        # Reproduce the visible metadata conflict, with synthetic pay cells.
        self.prev['collectionStart']='2026-08-03'
        self.prev['reliability']={'reliable':True,'reason':'complete month, collection running throughout'}
        items,warnings=s.candidates(self.cur,self.prev,TODAY,('CA',))
        self.assertEqual({x['kind'] for x in items},{'pay_spotlight'})
        self.assertIn('collection_started_after_period_start',warnings[0])

    def test_pay_change_and_period_labels(self):
        items,warnings=s.candidates(self.cur,self.prev,TODAY)
        m=next(x for x in items if x['kind']=='pay_movement')
        self.assertIn('16.7%',m['text'])
        self.assertEqual(m['previous'],'2026-08')
        self.assertEqual(warnings,[])

    def test_large_jump_suppressed_not_exaggerated(self):
        self.prev['pay'][0]['typicalCents']=2000
        self.prev['pay'][0]['p25Cents']=1800
        self.prev['pay'][0]['p75Cents']=2200
        items,_=s.candidates(self.cur,self.prev,TODAY)
        self.assertFalse(any(x['kind']=='pay_movement' for x in items))

    def test_wrong_month_rejected(self):
        with self.assertRaisesRegex(s.Hold,'not_latest_completed_month'):
            s.candidates(self.prev,None,TODAY)

    def test_states_opt_in_only(self):
        self.prev['demand']['states'][0]['postings']=1500
        items,_=s.candidates(self.cur,self.prev,TODAY)
        self.assertFalse(any(x['kind']=='posting_share' for x in items))
        items,_=s.candidates(self.cur,self.prev,TODAY,('CA',))
        m=next(x for x in items if x['kind']=='posting_share')
        self.assertIn('15.0% to 20.0%',m['text'])
        self.assertIn('+5.0 percentage points',m['text'])

    def test_selection_deterministic_and_avoids_used_stories(self):
        items,_=s.candidates(self.cur,self.prev,TODAY)
        first=s.select(items,set(),TODAY)
        self.assertEqual(first,s.select(items,set(),TODAY))
        self.assertNotEqual(first['key'],s.select(items,{first['key']},TODAY)['key'])

    def test_no_unused_story_holds(self):
        with self.assertRaisesRegex(s.Hold,'no_unused'): s.select([],set(),TODAY)

    def test_two_captions_and_distinct_tracking(self):
        story=s.select(s.candidates(self.cur,self.prev,TODAY)[0],set(),TODAY)
        texts=s.captions(story)
        self.assertEqual(set(texts),{'personal','company'})
        self.assertNotEqual(texts['personal'],texts['company'])
        for target in s.TARGETS:
            self.assertIn(story['text'],texts[target])
            self.assertIn('September 2026',texts[target])
            self.assertIn('utm_content='+target+'_',texts[target])


class LedgerTests(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory()
        self.db=s.database(Path(self.tmp.name)/'ledger.sqlite3')
        self.cur,self.prev=document(),document('2026-08',2400)
        self.plan=s.daily_plan(self.db,self.cur,self.prev,TODAY)
        self.calls=[]

    def tearDown(self):
        self.db.close(); self.tmp.cleanup()

    def sender(self,*args):
        self.calls.append(args)
        return 'urn:li:share:'+str(100+len(self.calls))

    def send(self,target='personal',sender=None):
        owner='urn:li:person:synthetic' if target=='personal' else 'urn:li:organization:123'
        return s.publish(self.db,self.plan,target,owner,'NOT-A-REAL-TOKEN','202609',sender or self.sender)

    def test_same_day_plan_reused(self):
        self.assertEqual(self.plan,s.daily_plan(self.db,self.cur,self.prev,TODAY))

    def test_source_change_holds(self):
        self.cur['pay'][0]['n']=41
        with self.assertRaisesRegex(s.Hold,'source_changed'):
            s.daily_plan(self.db,self.cur,self.prev,TODAY)

    def test_next_day_does_not_reuse_story(self):
        next_plan=s.daily_plan(self.db,self.cur,self.prev,date(2026,10,6))
        self.assertNotEqual(next_plan['story']['key'],self.plan['story']['key'])

    def test_exactly_one_attempt_per_destination(self):
        for _ in range(3):
            for target in s.TARGETS: self.send(target)
        self.assertEqual(len(self.calls),2)
        self.assertEqual({c[0] for c in self.calls},
                         {'urn:li:person:synthetic','urn:li:organization:123'})

    def test_timeout_not_blindly_retried(self):
        def timeout(*args):
            self.calls.append(args)
            raise TimeoutError('secret should never be logged')
        first=self.send(sender=timeout)
        self.assertEqual(first['status'],'needs_review')
        self.assertEqual(first['reason'],'TimeoutError')
        self.send(); self.assertEqual(len(self.calls),1)

    def test_missing_receipt_requires_review(self):
        result=self.send(sender=lambda *args:None)
        self.assertEqual(result['status'],'needs_review')
        self.send(); self.assertEqual(len(self.calls),0)

    def test_one_target_failure_does_not_duplicate_other(self):
        self.send('personal')
        def fail(*args): raise TimeoutError()
        self.send('company',sender=fail)
        self.send('personal'); self.send('company')
        self.assertEqual(len(self.calls),1)

    def test_changed_owner_blocked(self):
        self.send()
        with self.assertRaisesRegex(s.Hold,'destination_changed'):
            s.publish(self.db,self.plan,'personal','urn:li:person:other','fake','202609',self.sender)
        self.assertEqual(len(self.calls),1)

    def test_inflight_reservation_not_retried(self):
        self.db.execute('INSERT INTO deliveries VALUES (?,?,?,?,?,?,?)',
            (self.plan['day'],'personal','sending','urn:li:person:synthetic',None,None,'2026-10-05'))
        self.assertEqual(self.send()['status'],'sending')
        self.assertEqual(self.calls,[])

    def test_bad_owner_or_long_caption_cannot_publish(self):
        with self.assertRaises(s.Hold):
            s.publish(self.db,self.plan,'personal','urn:li:organization:123','fake','202609',self.sender)
        self.plan['captions']['personal']='x'*2801
        with self.assertRaises(s.Hold): self.send()
        self.assertEqual(self.calls,[])


class ProtocolTests(unittest.TestCase):
    def test_rest_posts_contract_and_receipt(self):
        class Response:
            status=201
            headers={'x-restli-id':'urn:li:ugcPost:123'}
            def __enter__(self): return self
            def __exit__(self,*args): pass
        with patch.object(s.request,'build_opener') as factory:
            factory.return_value.open.return_value=Response()
            result=s.send_linkedin('urn:li:person:synthetic','hello','fake','202609')
            req=factory.return_value.open.call_args.args[0]
            self.assertEqual(req.full_url,'https://api.linkedin.com/rest/posts')
            payload=json.loads(req.data)
            self.assertEqual(payload['author'],'urn:li:person:synthetic')
            self.assertEqual(payload['lifecycleState'],'PUBLISHED')
            self.assertEqual(payload['distribution']['feedDistribution'],'MAIN_FEED')
            self.assertEqual(result,'urn:li:ugcPost:123')
            factory.return_value.open.assert_called_once()

    def test_little_text_escaping(self):
        self.assertEqual(s.linkedin_text('Pay (median) [USD] @x'),'Pay \\(median\\) \\[USD\\] \\@x')

    def test_invalid_version_never_calls_network(self):
        with patch.object(s.request,'build_opener') as factory:
            with self.assertRaises(s.Hold): s.send_linkedin('urn:li:person:synthetic','x','fake','latest')
            factory.assert_not_called()


class CLITests(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory()
        self.repo=Path(self.tmp.name)/'repo'
        folder=self.repo/'api/_lib/signal/data/monthly'
        folder.mkdir(parents=True)
        for month in ('2026-09','2026-08'):
            (folder/(month+'.json')).write_text(json.dumps(document(month)))
        self.state=Path(self.tmp.name)/'private'
        self.argv=['daily_social.py','--repo-root',str(self.repo),'--state-dir',str(self.state)]
        class FixedDateTime(datetime):
            @classmethod
            def now(cls,tz=None): return cls(2026,10,5,8,0,tzinfo=s.ET)
        self.clock=FixedDateTime

    def tearDown(self): self.tmp.cleanup()

    def run_main(self,args=(),env=None):
        out,err=io.StringIO(),io.StringIO()
        with patch.object(sys,'argv',self.argv+list(args)),patch.dict(os.environ,env or {},clear=True), \
             patch.object(s,'datetime',self.clock),patch.object(s.request,'build_opener') as network, \
             contextlib.redirect_stdout(out),contextlib.redirect_stderr(err):
            code=s.main(); network.assert_not_called()
        return code,out.getvalue(),err.getvalue()

    def test_default_preview_has_no_ledger_or_network(self):
        code,out,err=self.run_main()
        self.assertEqual(code,0)
        self.assertEqual(json.loads(out)['status'],'preview_only')
        self.assertFalse(self.state.exists())

    def test_live_requires_explicit_gates(self):
        code,out,err=self.run_main(['--live'])
        self.assertEqual(code,2)
        self.assertIn('approval_missing',err)
        self.assertFalse(self.state.exists())

    def test_both_validates_company_before_publishing_personal(self):
        env={k:'1' for k in ('SOCIAL_LIVE_ENABLED','SOCIAL_TEMPLATE_APPROVED','SOCIAL_TARGETS_VERIFIED',
                             'SOCIAL_LANDING_PAGE_VERIFIED','SOCIAL_SOURCE_APPROVED')}
        env.update(LINKEDIN_PERSONAL_OWNER_URN='urn:li:person:synthetic',
                   LINKEDIN_PERSONAL_ACCESS_TOKEN='fake',LINKEDIN_API_VERSION='202609')
        code,out,err=self.run_main(['--live','--target','both'],env)
        self.assertEqual(code,2)
        self.assertIn('missing_verified_company_connection',err)
        self.assertFalse(self.state.exists())


if __name__=='__main__': unittest.main(verbosity=2)

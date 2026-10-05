#!/usr/bin/env python3
"""Daily, text-first Staffing Signal posts. Default is preview; no AI calls.
Only monthly aggregate files are read. Never reads individual job/company rows.
Run on ONE persistent host; do not use an ephemeral CI filesystem for the ledger.
"""
from __future__ import annotations
import argparse, calendar, hashlib, json, os, re, sqlite3, sys
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from urllib import request, error, parse
from zoneinfo import ZoneInfo

ET = ZoneInfo('America/New_York')
VERSION = 'staffing-social-1.0.0'
FORMAT = 'staffing-signal-monthly-aggregates'
LI = {'assembler','cdl-class-a-driver','cnc-machinist','delivery-driver','electrician',
      'forklift-operator','general-laborer','hvac-technician','machine-operator',
      'maintenance-technician','quality-inspector','warehouse-associate','welder'}
HC = {'cna','er-nurse','home-health-nurse','icu-registered-nurse','lpn-lvn',
      'med-surg-nurse','medical-assistant','medical-lab-technologist','nurse-practitioner',
      'occupational-therapist','or-nurse','pharmacist','pharmacy-technician',
      'physical-therapist','registered-nurse','speech-language-pathologist',
      'telemetry-nurse'}
LABELS = {'cdl-class-a-driver':'CDL Class A Driver','cnc-machinist':'CNC Machinist',
          'cna':'Certified Nursing Assistant','icu-registered-nurse':'ICU Registered Nurse',
          'lpn-lvn':'LPN/LVN','er-nurse':'ER Nurse','or-nurse':'OR Nurse',
          'hvac-technician':'HVAC Technician'}
TARGETS = ('personal', 'company')

class Hold(Exception):
    """Fail-closed, operator-readable reason; never includes credentials."""

def digest(value):
    return hashlib.sha256(json.dumps(value, sort_keys=True, separators=(',', ':')).encode()).hexdigest()

def previous_month(month):
    d = date.fromisoformat(month + '-01') - timedelta(days=1)
    return d.strftime('%Y-%m')

def month_label(month):
    d = date.fromisoformat(month + '-01')
    return d.strftime('%B %Y')

def label(key):
    return LABELS.get(key, key.replace('-', ' ').title())

def number(v):
    return type(v) in (int, float) and float('-inf') < v < float('inf')

def privacy(c):
    return (isinstance(c, dict) and c.get('status') == 'verified'
            and type(c.get('distinctFirms')) is int and c['distinctFirms'] >= 5
            and number(c.get('maxFirmShare')) and 0 <= c['maxFirmShare'] <= .5)

def validate_doc(doc, today):
    if not isinstance(doc, dict) or doc.get('format') != FORMAT or doc.get('schemaVersion') != 1:
        raise Hold('unsupported_monthly_format')
    if doc.get('calcVersion') != 'signal-month-1.0.0' or doc.get('baseCalcVersion') != 'signal-agg-1.1.0':
        raise Hold('method_version_needs_review')
    month = doc.get('month', '')
    if not isinstance(month,str) or not re.fullmatch(r'\d{4}-(0[1-9]|1[0-2])', month):
        raise Hold('invalid_month')
    start = date.fromisoformat(month + '-01')
    end = start.replace(day=calendar.monthrange(start.year, start.month)[1])
    if doc.get('period') != {'start': start.isoformat(), 'end': end.isoformat()} or end >= today:
        raise Hold('incomplete_or_invalid_period')
    if not isinstance(doc.get('reliability'),dict) or doc['reliability'].get('reliable') is not True:
        raise Hold('unreliable_month')
    try:
        collection = date.fromisoformat(doc['collectionStart'])
        generated = date.fromisoformat(doc['generatedAt'][:10])
        source = date.fromisoformat(doc['sourceBuiltAt'][:10])
    except (KeyError, TypeError, ValueError):
        raise Hold('missing_freshness_or_coverage') from None
    if collection > start:
        raise Hold('collection_started_after_period_start')
    if not 0 <= (today - generated).days <= 10 or not 0 <= (today - source).days <= 10:
        raise Hold('stale_or_future_source')
    method = doc.get('method', {})
    if not isinstance(method,dict):
        raise Hold('missing_method')
    if method.get('payValue') != 'hourly_mid per posting; travel weekly packages excluded':
        raise Hold('unreviewed_pay_basis')
    if method.get('quantile') != "statistics.quantiles(n=4, method='exclusive'); typical = median":
        raise Hold('unreviewed_quantile_method')
    if not isinstance(doc.get('pay'), list):
        raise Hold('missing_pay_cells')
    keys = [c.get('roleKey') for c in doc['pay'] if isinstance(c,dict) and c.get('level')=='nationwide']
    if any(not isinstance(k,str) for k in keys) or len(keys) != len(set(keys)):
        raise Hold('ambiguous_nationwide_pay_cells')
    return doc

def valid_pay(c):
    return (isinstance(c, dict) and c.get('level') == 'nationwide'
            and c.get('state') is None and c.get('city') is None
            and c.get('roleKey') in LI | HC and privacy(c.get('checks'))
            and type(c.get('n')) is int and c['n'] >= 30
            and c['checks']['distinctFirms'] <= c['n']
            and all(type(c.get(k)) is int and c[k] > 0 for k in ('p25Cents','typicalCents','p75Cents'))
            and c['p25Cents'] <= c['typicalCents'] <= c['p75Cents'])

def candidates(cur, prev, today, public_states=()):
    """Cur may yield snapshots even when previous month's metadata blocks trends."""
    validate_doc(cur, today)
    if cur['month'] != previous_month(today.strftime('%Y-%m')):
        raise Hold('not_latest_completed_month')
    warnings, out = [], []
    try:
        validate_doc(prev or {}, today)
        if prev['month'] != previous_month(cur['month']):
            raise Hold('nonconsecutive_comparison')
        if prev['method'] != cur['method']:
            raise Hold('different_methods')
    except Hold as exc:
        warnings.append('Trend posts held: ' + str(exc))
        prev = None
    prev_idx = {c['roleKey']: c for c in (prev or {}).get('pay', []) if valid_pay(c)}
    for c in cur['pay']:
        if not valid_pay(c):
            continue
        role, cents = c['roleKey'], c['typicalCents']
        common = dict(subject=role, sector='light-industrial' if role in LI else 'healthcare',
                      period=cur['month'], geography='Nationwide', n=c['n'])
        out.append(dict(common, kind='pay_spotlight', key=f"spotlight:{cur['month']}:{role}",
                        text=f"{label(role)}: typical advertised pay ${cents/100:.2f}/hr. "
                             f"Middle-half range: ${c['p25Cents']/100:.2f}-${c['p75Cents']/100:.2f}/hr."))
        p = prev_idx.get(role)
        if p:
            pct = (cents / p['typicalCents'] - 1) * 100
            if 2 <= abs(pct) <= 20:
                arrow, verb = ('▲','rose') if pct > 0 else ('▼','fell')
                out.append(dict(common, kind='pay_movement', key=f"pay:{cur['month']}:{role}",
                                previous=prev['month'], text=f"{arrow} {label(role)} typical advertised pay "
                                f"{verb} {abs(pct):.1f}% to ${cents/100:.2f}/hr "
                                f"(from ${p['typicalCents']/100:.2f}/hr)."))
    # State-level promotion is opt-in; private/local website results are not automatically public.
    if prev and public_states:
        ct, pt = cur.get('totals', {}).get('postings'), prev.get('totals', {}).get('postings')
        if type(ct) is int and type(pt) is int and ct > 0 and pt > 0:
            idx = {s.get('code'): s for s in prev.get('demand', {}).get('states', [])}
            for s in cur.get('demand', {}).get('states', []):
                code, p = s.get('code'), idx.get(s.get('code'))
                if code not in public_states or not p or not privacy(s.get('checks')) or not privacy(p.get('checks')):
                    continue
                a, b = s.get('postings'), p.get('postings')
                if (type(a) is not int or type(b) is not int or not 200 <= a <= ct or not 200 <= b <= pt
                    or s['checks']['distinctFirms'] > a or p['checks']['distinctFirms'] > b):
                    continue
                before, after = b / pt * 100, a / ct * 100
                change = (after / before - 1) * 100
                if 10 <= abs(change) <= 75:
                    out.append(dict(subject=code, sector='market', period=cur['month'], previous=prev['month'],
                                    geography='Observed U.S. postings', n=a, kind='posting_share',
                                    key=f"share:{cur['month']}:{code}", text=f"{'▲' if after > before else '▼'} "
                                    f"{code}'s share of observed staffing-firm postings moved from "
                                    f"{before:.1f}% to {after:.1f}% ({after-before:+.1f} percentage points)."))
    return out, warnings

def select(items, used, today, recent_subjects=()):
    eligible = [x for x in items if x['key'] not in used]
    fresh = [x for x in eligible if x['subject'] not in recent_subjects]
    if fresh:
        eligible = fresh
    if not eligible:
        raise Hold('no_unused_eligible_story')
    desired = ('light-industrial','healthcare','market')[today.toordinal() % 3]
    return sorted(eligible, key=lambda x: (x['sector'] != desired,
                  x['kind'] == 'pay_spotlight', digest(today.isoformat()+x['key'])))[0]

def captions(story):
    period = month_label(story['period'])
    if story.get('previous'):
        period += ' versus ' + month_label(story['previous'])
    basis = f"{story['geography']} | {period}"
    caveat = ('Observed posting share, not unique vacancies or placements.' if story['kind'] == 'posting_share'
              else 'Advertised pay, not actual wages or client bill rates. Includes salary-to-hourly conversions at 2,080 hours/year; excludes travel packages.')
    result = {}
    for target in TARGETS:
        query = parse.urlencode(dict(utm_source='linkedin', utm_medium='organic_social',
                                utm_campaign='staffing_signal_daily', utm_content=target+'_'+story['key']))
        intro = ('A staffing-market number worth a look:' if target == 'personal'
                 else 'THE STAFFING SIGNAL | Market snapshot')
        result[target] = '\n\n'.join((intro, story['text'], basis, caveat,
                         'Explore more pay and market information. Get free access to The Staffing Signal.',
                         'https://thestaffingsignal.com/?'+query))
    return result

def database(path):
    path.parent.mkdir(parents=True, exist_ok=True)
    db = sqlite3.connect(path, timeout=15, isolation_level=None)
    db.row_factory = sqlite3.Row
    db.execute('PRAGMA journal_mode=WAL')
    db.executescript('''CREATE TABLE IF NOT EXISTS plans (
      day TEXT PRIMARY KEY, story_key TEXT NOT NULL UNIQUE, subject TEXT NOT NULL,
      source_hash TEXT NOT NULL, plan TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS deliveries (
      day TEXT NOT NULL, target TEXT NOT NULL, status TEXT NOT NULL, owner TEXT NOT NULL,
      post_id TEXT, error TEXT, updated_at TEXT NOT NULL, PRIMARY KEY(day,target));''')
    return db

def daily_plan(db, cur, prev, today, public_states=()):
    items, warnings = candidates(cur, prev, today, public_states)
    source_hash = digest([cur, prev])
    day = today.isoformat()
    db.execute('BEGIN IMMEDIATE')
    try:
        saved = db.execute('SELECT * FROM plans WHERE day=?', (day,)).fetchone()
        if saved:
            if saved['source_hash'] != source_hash:
                raise Hold('source_changed_after_plan_creation')
            plan = json.loads(saved['plan'])
            if not any(x['key'] == plan['story']['key'] for x in items):
                raise Hold('story_no_longer_eligible')
        else:
            used = {r[0] for r in db.execute('SELECT story_key FROM plans')}
            recent = {r[0] for r in db.execute('SELECT subject FROM plans WHERE day>=?',
                       ((today-timedelta(days=7)).isoformat(),))}
            story = select(items, used, today, recent)
            plan = dict(version=VERSION, day=day, story=story, captions=captions(story),
                        warnings=warnings, source_hash=source_hash)
            db.execute('INSERT INTO plans VALUES (?,?,?,?,?)',
                       (day, story['key'], story['subject'], source_hash, json.dumps(plan)))
        db.execute('COMMIT')
        return plan
    except Exception:
        db.execute('ROLLBACK')
        raise

class NoRedirect(request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        raise Hold('unexpected_publish_redirect')

def linkedin_text(text):
    # LinkedIn commentary uses Little Text: preserve literal reserved characters.
    return re.sub(r'([\\()*\[\]{}<>@|~_])', lambda m: '\\'+m.group(0), text)

def send_linkedin(owner, text, token, version):
    if not re.fullmatch(r'\d{6}', version):
        raise Hold('set_current_supported_linkedin_api_version')
    payload = dict(author=owner, commentary=linkedin_text(text), visibility='PUBLIC', lifecycleState='PUBLISHED',
                   distribution=dict(feedDistribution='MAIN_FEED',targetEntities=[],thirdPartyDistributionChannels=[]),
                   isReshareDisabledByAuthor=False)
    req = request.Request('https://api.linkedin.com/rest/posts', data=json.dumps(payload).encode(),
          headers={'Authorization':'Bearer '+token,'LinkedIn-Version':version,
                   'X-Restli-Protocol-Version':'2.0.0','Content-Type':'application/json'}, method='POST')
    # No application-level retries. A timeout may have happened AFTER publication.
    with request.build_opener(NoRedirect).open(req, timeout=35) as response:
        post_id = response.headers.get('x-restli-id', '')
        if response.status != 201 or not re.fullmatch(r'urn:li:(share|ugcPost):\d+',post_id):
            raise Hold('publish_receipt_missing')
        return post_id

def publish(db, plan, target, owner, token, api_version, sender=send_linkedin):
    text = plan['captions'][target]
    expected = r'urn:li:person:[A-Za-z0-9_-]+' if target == 'personal' else r'urn:li:organization:\d+'
    if not re.fullmatch(expected,owner or '') or not token or len(text) > 2800:
        raise Hold('invalid_owner_token_or_caption')
    now = datetime.now(timezone.utc).isoformat()
    # Reserve before the external side effect. A crash leaves 'sending' for manual reconciliation.
    db.execute('BEGIN IMMEDIATE')
    try:
        old = db.execute('SELECT status,owner FROM deliveries WHERE day=? AND target=?', (plan['day'],target)).fetchone()
        if old:
            if old['owner'] != owner:
                raise Hold('destination_changed_after_reservation')
            db.execute('COMMIT')
            return {'target':target,'status':old['status'],'sent_now':False}
        db.execute('INSERT INTO deliveries VALUES (?,?,?,?,?,?,?)',
                   (plan['day'],target,'sending',owner,None,None,now))
        db.execute('COMMIT')
    except Exception:
        db.execute('ROLLBACK')
        raise
    try:
        post_id = sender(owner,text,token,api_version)
        if not isinstance(post_id,str) or not re.fullmatch(r'urn:li:(share|ugcPost):\d+',post_id):
            raise Hold('publish_receipt_missing')
        db.execute('UPDATE deliveries SET status=?,post_id=?,updated_at=? WHERE day=? AND target=?',
                   ('published',post_id,now,plan['day'],target))
        return {'target':target,'status':'published','post_id':post_id,'sent_now':True}
    except Exception as exc:
        # Do not log request headers, tokens, response bodies, or signed URLs.
        code = 'http_'+str(exc.code) if isinstance(exc,error.HTTPError) else type(exc).__name__
        db.execute('UPDATE deliveries SET status=?,error=?,updated_at=? WHERE day=? AND target=?',
                   ('needs_review',code,now,plan['day'],target))
        return {'target':target,'status':'needs_review','reason':code,'sent_now':False}

def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--repo-root', type=Path, default=Path(__file__).resolve().parents[2])
    p.add_argument('--state-dir', type=Path, required=True, help='Persistent private directory, OUTSIDE the Git checkout')
    p.add_argument('--target', choices=['personal','company','both'], default='both')
    p.add_argument('--live', action='store_true', help='Also requires explicit approval/environment gates')
    args = p.parse_args()
    today = datetime.now(ET).date()
    folder = args.repo_root / 'api/_lib/signal/data/monthly'
    month = previous_month(today.strftime('%Y-%m'))
    try:
        cur = json.loads((folder/(month+'.json')).read_text())
        before = folder/(previous_month(month)+'.json')
        prev = json.loads(before.read_text()) if before.exists() else None
        public_states = tuple(x for x in os.getenv('SOCIAL_PUBLIC_STATE_CODES','').split(',') if re.fullmatch('[A-Z]{2}',x))
        # Preview is deliberately non-persistent: inspecting drafts never consumes live stories.
        if not args.live:
            items,warnings = candidates(cur,prev,today,public_states)
            story = select(items,set(),today)
            print(json.dumps(dict(status='preview_only',eligible_count=len(items),warnings=warnings,
                                  story=story,captions=captions(story)),indent=2))
            return 0
        if any(os.getenv(k) != '1' for k in ('SOCIAL_LIVE_ENABLED','SOCIAL_TEMPLATE_APPROVED','SOCIAL_TARGETS_VERIFIED','SOCIAL_LANDING_PAGE_VERIFIED','SOCIAL_SOURCE_APPROVED')):
            raise Hold('live_disabled_or_approval_missing')
        targets = TARGETS if args.target == 'both' else (args.target,)
        # Validate ALL selected credentials before reserving a story or publishing either destination.
        config = {}
        for target in targets:
            prefix = 'LINKEDIN_'+target.upper()
            owner, token = os.getenv(prefix+'_OWNER_URN',''), os.getenv(prefix+'_ACCESS_TOKEN','')
            pattern = r'urn:li:person:[A-Za-z0-9_-]+' if target=='personal' else r'urn:li:organization:\d+'
            if not re.fullmatch(pattern,owner) or not token:
                raise Hold('missing_verified_'+target+'_connection')
            config[target]=(owner,token)
        version = os.getenv('LINKEDIN_API_VERSION','')
        if not re.fullmatch(r'\d{6}',version):
            raise Hold('set_current_supported_linkedin_api_version')
        state = args.state_dir.resolve()
        if state.is_relative_to(args.repo_root.resolve()):
            raise Hold('state_directory_must_be_outside_repository')
        state.mkdir(parents=True,exist_ok=True,mode=0o700)
        os.chmod(state,0o700)
        db = database(state/'social.sqlite3')
        try:
            plan = daily_plan(db,cur,prev,today,public_states)
            results = [publish(db,plan,t,*config[t],version) for t in targets]
        finally:
            db.close()
        print(json.dumps(dict(day=today.isoformat(),deliveries=results)))
        return 2 if any(r['status']!='published' for r in results) else 0
    except (Hold,OSError,ValueError,TypeError,KeyError) as exc:
        print(json.dumps({'status':'held','reason':str(exc) if isinstance(exc,Hold) else type(exc).__name__}),file=sys.stderr)
        return 2

if __name__ == '__main__':
    sys.exit(main())

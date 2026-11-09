"""Named areas that pool several cities into one pay cell (The Staffing Signal).

An area is published as a city-level cell whose city key is the area's own key
('CA:inland-empire', 'TX:greater-houston'), so every existing city feature (pay
lookup, sign-up area, monthly email) works on it unchanged. An area cell is built
from the SAME population and held to the SAME publication rule as any other cell
(>= 3 distinct staffing firms, no firm over 50% of observations); pooling only
widens the set of postings a cell may draw on. Cities keep their own cells too.

An area that crosses a state line is LISTED under each state a reader may pick
(Greater Washington under DC, VA and MD). Each listing is its own key and cell
('VA:greater-washington') with identical figures, because a pay cell carries a
single state. Membership is decided once per posting, by the posting's own city.

Two kinds of definition:
  * Inland Empire (cities): Riverside + San Bernardino counties. The pay data has
    no county field, so membership is by city name, copied from the pipeline's
    tools/pay_benchmarks.py REGIONS["Inland Empire, CA"] (2026-11-06). The site does
    not import across repos; keep the two lists in step by hand.
  * Metros (counties): an approximation of the US Census (OMB) metro-area county
    lists. A posting's city is mapped to its county with the site's own
    src/constants/cityCountyMapping.js, then the county decides. Where one place
    name exists in several counties of a state the map holds a single answer, so a
    few postings may land in a neighbouring county; that blurs a metro's edge, never
    its centre.

City names are matched after the export's own normalisation (accents folded,
'City of' / 'Greater' prefix and ' County' / ' Metro Area' suffix dropped), so
'City of Fontana' and 'Greater Houston' count. A posting that names an area itself
('Inland Empire') counts too.

Areas must not overlap (no county in two metros, no Inland Empire city inside a
metro's counties): tests/python/test_signal_regions.py checks it. The picker entries
live in shared/signal/geography.js (CITIES); `python scripts/signal_regions.py --dump`
prints the expected entries and a JS test fails if the two drift.

Choosing the metros (2026-11-09): a metro is listed when pooling makes at least 10
job types publishable AND at least 8 of those are not publishable for the metro's
main picker city today (scored on the 2026-11-09 pipeline build). Edit AREAS to add
or drop one; nothing else needs to change but the matching geography.js entries.
"""
import functools
import json
import re
import sys
import unicodedata
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]
COUNTY_MAP_JS = REPO / "src" / "constants" / "cityCountyMapping.js"

INLAND_EMPIRE_KEY = "CA:inland-empire"

_INLAND_EMPIRE_NAMES = """san bernardino,fontana,ontario,rancho cucamonga,rialto,colton,chino,chino hills,upland,
montclair,redlands,highland,yucaipa,loma linda,grand terrace,victorville,hesperia,apple valley,adelanto,barstow,
twentynine palms,yucca valley,big bear lake,big bear city,lake arrowhead,crestline,running springs,mentone,
bloomington,muscoy,phelan,pinon hills,needles,joshua tree,wrightwood,oak hills,lytle creek,fort irwin,
lucerne valley,helendale,oro grande,spring valley lake,mountain pass,fawnskin,sugarloaf,angelus oaks,forest falls,
riverside,corona,moreno valley,perris,jurupa valley,mira loma,eastvale,norco,temecula,murrieta,menifee,
lake elsinore,wildomar,canyon lake,hemet,san jacinto,beaumont,banning,calimesa,cherry valley,palm springs,
cathedral city,palm desert,indio,coachella,la quinta,rancho mirage,desert hot springs,indian wells,blythe,
march air reserve base,sun city,winchester,thousand palms,bermuda dunes,thermal,mecca,home gardens,woodcrest,
lakeland village,nuevo,romoland,homeland,quail valley,rubidoux,glen avon,pedley,ripley,mead valley,good hope,
aguanga,anza,idyllwild,mountain center,pine cove,temescal valley,french valley,valle vista,sedco hills,
rancho california,whitewater,desert center,sky valley,north palm springs,inland empire"""


def clean_city(city):
    """A posting's city with accents folded and decoration dropped ('City of Fontana' -> 'Fontana').

    The one cleaning rule shared by city_key() in export_signal_snapshot and the county lookup."""
    c = " ".join(unicodedata.normalize("NFKD", city or "").encode("ascii", "ignore").decode().split())
    c = re.sub(r"^(greater|city of)\s+", "", c, flags=re.I)
    return re.sub(r"\s+(county|metropolitan area|metro area|metro|area)$", "", c, flags=re.I).strip(" ,")


def _slug(name):
    """Same slug rule as export_signal_snapshot.city_key (test-enforced)."""
    c = " ".join(unicodedata.normalize("NFKD", name or "").encode("ascii", "ignore").decode().split())
    return re.sub(r"[^a-z0-9]+", "-", c.lower().replace("st.", "st")).strip("-")


# ------------------------------------------------------------------ counties
def _county_name(city):
    """Normalise a city for the county map: lower case, no punctuation, St/Ft/Mt spelled out."""
    c = clean_city(city).lower().replace("'", "").replace(".", "")
    c = re.sub(r"\bst\b", "saint", c)
    c = re.sub(r"\bft\b", "fort", c)
    c = re.sub(r"\bmt\b", "mount", c)
    return " ".join(c.split())


@functools.lru_cache(maxsize=1)
def county_map():
    """{state code: {normalised city name: county name}} parsed from the site's own city->county map."""
    cmap, st = {}, None
    for line in COUNTY_MAP_JS.read_text(encoding="utf-8").splitlines():
        if line.startswith("export const getCountyForCity"):
            break
        m = re.match(r"^  '([A-Z]{2})': \{", line)
        if m:
            st = m.group(1)
            cmap[st] = {}
            continue
        m = re.match(r"^    '(.*)': '(.*)',?$", line)
        if m and st:
            cmap[st][m.group(1).replace("\\'", "'")] = m.group(2)
    return cmap


def county_for(state, city):
    """The county name the site's map gives a posting's city, else None. The District of Columbia is one county."""
    if state == "DC":
        return "district of columbia"
    return county_map().get(state, {}).get(_county_name(city))


# --------------------------------------------------------------------- areas
def _counties(spec):
    return {st: frozenset(c.strip() for c in names.split(",") if c.strip()) for st, names in spec.items()}


# slug, label, states it is listed under (first = anchor), what the picker says it covers,
# member counties by state. Counties are the site map's names (VA independent cities
# appear both bare and with ' city' because the map uses both forms).
_METROS = [
    ("greater-washington", "Greater Washington", ["DC", "VA", "MD"], "DC, northern Virginia + Maryland suburbs",
     {"DC": "district of columbia", "VA": "fairfax,arlington,loudoun,prince william,alexandria,alexandria city,falls church,manassas,manassas park,stafford,spotsylvania,fredericksburg,fredericksburg city,fauquier", "MD": "montgomery,prince georges,frederick,charles,calvert", "WV": "jefferson"}),
    ("greater-los-angeles", "Greater Los Angeles", ["CA"], "Los Angeles + Orange counties",
     {"CA": "los angeles,orange"}),
    ("greater-philadelphia", "Greater Philadelphia", ["PA", "NJ", "DE"], "Philadelphia, suburbs, South Jersey + New Castle, DE",
     {"PA": "philadelphia,bucks,chester,delaware,montgomery", "NJ": "burlington,camden,gloucester,salem", "DE": "new castle", "MD": "cecil"}),
    ("bay-area", "San Francisco Bay Area", ["CA"], "the 9 Bay Area counties",
     {"CA": "alameda,contra costa,marin,napa,san francisco,san mateo,santa clara,solano,sonoma"}),
    ("greater-new-york", "Greater New York", ["NY", "NJ"], "NYC, Long Island, Westchester + northern New Jersey",
     {"NY": "new york,kings,queens,bronx,richmond,nassau,suffolk,westchester,rockland,putnam,orange,dutchess", "NJ": "bergen,hudson,essex,middlesex,monmouth,ocean,passaic,union,morris,somerset,sussex,hunterdon", "PA": "pike"}),
    ("baltimore-area", "Baltimore Area", ["MD"], "Baltimore city + county and nearby counties",
     {"MD": "baltimore,baltimore city,anne arundel,howard,harford,carroll,queen annes"}),
    ("greater-chicago", "Greater Chicago", ["IL", "IN"], "Cook, DuPage, Lake, Will + nearby counties",
     {"IL": "cook,dupage,kane,lake,mchenry,will,kendall,dekalb,grundy", "IN": "lake,porter,newton,jasper", "WI": "kenosha"}),
    ("dallas-fort-worth", "Dallas-Fort Worth", ["TX"], "Dallas, Tarrant, Collin, Denton + nearby counties",
     {"TX": "collin,dallas,denton,ellis,hood,hunt,johnson,kaufman,parker,rockwall,somervell,tarrant,wise"}),
    ("greater-boston", "Greater Boston", ["MA", "NH"], "Boston, Middlesex, Essex, Norfolk, Plymouth + southern NH",
     {"MA": "suffolk,middlesex,essex,norfolk,plymouth", "NH": "rockingham,strafford"}),
    ("twin-cities", "Twin Cities", ["MN", "WI"], "Minneapolis, St. Paul + nearby counties",
     {"MN": "hennepin,ramsey,anoka,dakota,washington,scott,carver,wright,sherburne,chisago,isanti", "WI": "pierce,saint croix"}),
    ("research-triangle", "Research Triangle", ["NC"], "Wake, Durham + nearby counties",
     {"NC": "wake,durham,johnston,orange,chatham,franklin,person"}),
    ("hampton-roads", "Hampton Roads", ["VA"], "Norfolk, Virginia Beach, Newport News + nearby",
     {"VA": "chesapeake,chesapeake city,hampton,hampton city,newport news,newport news city,norfolk,norfolk city,portsmouth,suffolk,suffolk city,virginia beach,virginia beach city,james city,york,gloucester,isle of wight,poquoson,williamsburg,williamsburg city", "NC": "currituck"}),
    ("greater-seattle", "Greater Seattle", ["WA"], "King, Pierce + Snohomish counties",
     {"WA": "king,pierce,snohomish"}),
    ("greater-detroit", "Greater Detroit", ["MI"], "Wayne, Oakland, Macomb + nearby counties",
     {"MI": "wayne,oakland,macomb,livingston,saint clair,lapeer"}),
    ("greater-atlanta", "Greater Atlanta", ["GA"], "Fulton, DeKalb, Cobb, Gwinnett + nearby counties",
     {"GA": "fulton,dekalb,cobb,gwinnett,clayton,cherokee,forsyth,henry,douglas,paulding,fayette,rockdale,newton,coweta,barrow,spalding,walton,butts,carroll"}),
    ("south-florida", "South Florida", ["FL"], "Miami-Dade, Broward + Palm Beach counties",
     {"FL": "miami-dade,broward,palm beach"}),
    ("greater-phoenix", "Greater Phoenix", ["AZ"], "Maricopa + Pinal counties",
     {"AZ": "maricopa,pinal"}),
    ("greater-pittsburgh", "Greater Pittsburgh", ["PA"], "Allegheny + nearby counties",
     {"PA": "allegheny,beaver,butler,fayette,washington,westmoreland,armstrong"}),
    ("greater-denver", "Greater Denver", ["CO"], "Denver, Adams, Arapahoe, Jefferson, Douglas + nearby",
     {"CO": "denver,adams,arapahoe,jefferson,douglas,broomfield,elbert,clear creek,gilpin,park"}),
    ("greater-cleveland", "Greater Cleveland", ["OH"], "Cuyahoga, Summit, Lorain + nearby counties",
     {"OH": "cuyahoga,lake,lorain,medina,geauga,summit,portage"}),
    ("greater-portland", "Greater Portland", ["OR", "WA"], "Portland metro + Clark County, WA",
     {"OR": "multnomah,washington,clackamas,columbia,yamhill", "WA": "clark,skamania"}),
    ("central-valley", "Central Valley", ["CA"], "Fresno, Kern, San Joaquin, Stanislaus + nearby",
     {"CA": "fresno,madera,kings,tulare,merced,stanislaus,san joaquin,kern"}),
    ("greater-houston", "Greater Houston", ["TX"], "Harris, Fort Bend, Montgomery + nearby counties",
     {"TX": "harris,fort bend,montgomery,brazoria,galveston,liberty,waller,chambers,austin"}),
    ("greater-columbus", "Greater Columbus", ["OH"], "Franklin, Delaware, Licking + nearby counties",
     {"OH": "franklin,delaware,licking,fairfield,madison,pickaway,union,morrow"}),
    ("greater-nashville", "Greater Nashville", ["TN"], "Davidson, Williamson, Rutherford + nearby counties",
     {"TN": "davidson,williamson,rutherford,wilson,sumner,maury,cheatham,dickson,robertson,trousdale"}),
    ("greater-tampa", "Greater Tampa Bay", ["FL"], "Hillsborough, Pinellas, Pasco + Hernando",
     {"FL": "hillsborough,pinellas,pasco,hernando"}),
    ("kansas-city-area", "Kansas City Area", ["MO", "KS"], "Kansas City, MO + KS, with nearby counties",
     {"MO": "jackson,clay,platte,cass,clinton,lafayette,bates,caldwell,ray", "KS": "johnson,wyandotte,leavenworth,miami,linn"}),
    ("greater-st-louis", "Greater St. Louis", ["MO", "IL"], "St. Louis city + county, St. Charles + Illinois side",
     {"MO": "saint louis,saint louis city,saint charles,jefferson,franklin,lincoln,warren,washington", "IL": "madison,saint clair,clinton,monroe,jersey,macoupin"}),
    ("greater-milwaukee", "Greater Milwaukee", ["WI"], "Milwaukee, Waukesha, Washington + Ozaukee",
     {"WI": "milwaukee,waukesha,washington,ozaukee"}),
    ("greenville-spartanburg", "Greenville-Spartanburg", ["SC"], "Greenville, Spartanburg + nearby counties",
     {"SC": "greenville,spartanburg,pickens,laurens,anderson,cherokee,union"}),
    ("greater-austin", "Greater Austin", ["TX"], "Travis, Williamson, Hays + nearby counties",
     {"TX": "travis,williamson,hays,bastrop,caldwell"}),
    ("greater-indianapolis", "Greater Indianapolis", ["IN"], "Marion + the surrounding counties",
     {"IN": "marion,hamilton,hendricks,johnson,hancock,boone,morgan,shelby,brown,putnam"}),
    ("greater-richmond", "Greater Richmond", ["VA"], "Richmond city, Henrico, Chesterfield + nearby",
     {"VA": "richmond,richmond city,chesterfield,henrico,hanover,goochland,powhatan,new kent,prince george,colonial heights,colonial heights city,hopewell,petersburg,petersburg city,dinwiddie,charles city,amelia"}),
    # Added 2026-11-09 at the owner's request after the near-miss review (each just under the
    # "gain >= 8" bar or "pooled >= 10" bar when scored): same definitions, same gate.
    ("greater-charlotte", "Greater Charlotte", ["NC", "SC"], "Mecklenburg, Union, Cabarrus + York, SC and nearby",
     {"NC": "mecklenburg,union,cabarrus,gaston,iredell,lincoln,rowan", "SC": "york,lancaster,chester"}),
    ("piedmont-triad", "Piedmont Triad", ["NC"], "Greensboro, Winston-Salem, High Point + nearby",
     {"NC": "guilford,forsyth,randolph,davidson,rockingham,alamance,stokes,davie,yadkin"}),
    ("lehigh-valley", "Lehigh Valley", ["PA", "NJ"], "Allentown, Bethlehem, Easton + Warren, NJ",
     {"PA": "lehigh,northampton", "NJ": "warren"}),
    ("greater-cincinnati", "Greater Cincinnati", ["OH", "KY", "IN"], "Hamilton, Butler, Warren + northern Kentucky",
     {"OH": "hamilton,butler,clermont,warren,brown", "KY": "boone,kenton,campbell,grant,gallatin,bracken,pendleton", "IN": "dearborn,ohio,union"}),
    ("greater-sacramento", "Greater Sacramento", ["CA"], "Sacramento, Placer, El Dorado + Yolo counties",
     {"CA": "sacramento,el dorado,placer,yolo"}),
]

AREAS = {
    "inland-empire": {
        "label": "Inland Empire", "states": ["CA"], "covers": "Riverside + San Bernardino counties",
        "cities": frozenset(f"CA:{_slug(n)}" for n in (x.strip() for x in _INLAND_EMPIRE_NAMES.replace("\n", "").split(",")) if n),
        "counties": {},
    },
}
INLAND_EMPIRE_NAMES = tuple(n.strip() for n in _INLAND_EMPIRE_NAMES.replace("\n", "").split(",") if n.strip())
for _slug_, _label, _states, _covers, _spec in _METROS:
    AREAS[_slug_] = {"label": _label, "states": _states, "covers": _covers, "cities": frozenset(), "counties": _counties(_spec)}


def listings(slug):
    """[(state, key)] for an area: one entry per state it is listed under ('VA', 'VA:greater-washington')."""
    return [(st, f"{st}:{slug}") for st in AREAS[slug]["states"]]


def _build_indexes():
    by_key, by_city, by_county = {}, {}, {}
    for slug, a in AREAS.items():
        for st, key in listings(slug):
            if key in by_key:
                raise ValueError(f"duplicate area key {key}")
            by_key[key] = slug
        for ck in a["cities"]:
            by_city[ck] = slug
        for st, names in a["counties"].items():
            for c in names:
                if (st, c) in by_county:
                    raise ValueError(f"county {st}/{c} is in two areas: {by_county[(st, c)]}, {slug}")
                by_county[(st, c)] = slug
    return by_key, by_city, by_county


LISTING_INDEX, _CITY_INDEX, _COUNTY_INDEX = _build_indexes()
REGION_KEYS = frozenset(LISTING_INDEX)  # every area key a pay cell may carry

REGIONS = AREAS  # earlier name, kept for readers of the first version


def member_areas(state, city, city_key):
    """Slugs of the areas a posting belongs to, from its state code, raw city and the export's city key.

    `city_key` is state-prefixed ('CA:fontana'), so a same-named city in another state can never match."""
    if not state or not city_key:
        return []
    found = []
    for slug in (LISTING_INDEX.get(city_key), _CITY_INDEX.get(city_key)):  # names the area itself / city list
        if slug and slug not in found:
            found.append(slug)
    county = county_for(state, city)
    slug = _COUNTY_INDEX.get((state, county)) if county else None
    if slug and slug not in found:
        found.append(slug)
    return found


def region_for(city_key):
    """The Inland Empire key for a city-list member ('CA:fontana' -> 'CA:inland-empire'), else None.

    Kept from the first version; county-based areas need member_areas()."""
    slug = _CITY_INDEX.get(city_key or "")
    return f"{AREAS[slug]['states'][0]}:{slug}" if slug else None


def dump():
    """The picker entries geography.js must hold, as JSON (checked by tests/signal/areas.test.mjs)."""
    out = []
    for slug, a in AREAS.items():
        for st, key in listings(slug):
            out.append({"key": key, "name": a["label"], "state": st, "area": a["covers"]})
    return out


if __name__ == "__main__":
    if "--dump" in sys.argv:
        print(json.dumps(dump(), indent=1))
    else:
        print(f"{len(AREAS)} areas, {len(REGION_KEYS)} listings")

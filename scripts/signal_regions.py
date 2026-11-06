"""Named areas that pool several cities into one pay cell (The Staffing Signal).

An area is published as a city-level cell whose city key is the area's own key
('CA:inland-empire'), so every existing city feature (pay lookup, sign-up area,
monthly email) works on it unchanged. The area cell is built from the SAME
population and held to the SAME publication rule as any other cell (>= 3
distinct staffing firms, no firm over 50% of observations); pooling only widens
the set of postings a cell may draw on. Cities keep their own cells too.

Inland Empire = Riverside + San Bernardino counties. The pay data has no county
field, so membership is by city name. The name list is copied from the pipeline's
tools/pay_benchmarks.py REGIONS["Inland Empire, CA"] (2026-11-06) so the site and
the pipeline-side table mean the same thing; the site does not import across
repos. Keep the two lists in step by hand.

Names are matched after the export's own city-key normalisation (accents folded,
'City of' / 'Greater' prefix and ' County' / ' Metro Area' suffix dropped), so
'City of Fontana' and 'Riverside County' count; a posting that names the region
itself ('Inland Empire') counts too.

The area's picker entry lives in shared/signal/geography.js (CITIES); the keys
here and there must match (tests/python/test_signal_regions.py checks it).
"""
import re
import unicodedata

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


def _slug(name):
    """Same slug rule as export_signal_snapshot.city_key (test-enforced)."""
    c = unicodedata.normalize("NFKD", name or "").encode("ascii", "ignore").decode()
    c = " ".join(c.split())
    return re.sub(r"[^a-z0-9]+", "-", c.lower().replace("st.", "st")).strip("-")


INLAND_EMPIRE_NAMES = tuple(n.strip() for n in _INLAND_EMPIRE_NAMES.replace("\n", "").split(",") if n.strip())

# area key -> {"label", "state", "cityKeys": frozenset of member city keys}
REGIONS = {
    INLAND_EMPIRE_KEY: {
        "label": "Inland Empire, CA",
        "state": "CA",
        "cityKeys": frozenset(f"CA:{_slug(n)}" for n in INLAND_EMPIRE_NAMES),
    },
}

REGION_KEYS = frozenset(REGIONS)


def region_for(city_key):
    """The area key a city key belongs to ('CA:fontana' -> 'CA:inland-empire'), else None.

    `city_key` is the export's own city key (state-prefixed slug), so a same-named
    city in another state ('AZ:sun-city') can never match."""
    if not city_key:
        return None
    for key, region in REGIONS.items():
        if city_key in region["cityKeys"]:
            return key
    return None

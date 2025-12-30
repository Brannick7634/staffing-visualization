import { useEffect, useRef, useState, useMemo } from 'react'
import * as am5 from '@amcharts/amcharts5'
import * as am5map from '@amcharts/amcharts5/map'
import am5themes_Animated from '@amcharts/amcharts5/themes/Animated'

// Import county geodata for all US states
import am5geodata_region_usa_alLow from '@amcharts/amcharts5-geodata/region/usa/alLow'
import am5geodata_region_usa_akLow from '@amcharts/amcharts5-geodata/region/usa/akLow'
import am5geodata_region_usa_azLow from '@amcharts/amcharts5-geodata/region/usa/azLow'
import am5geodata_region_usa_arLow from '@amcharts/amcharts5-geodata/region/usa/arLow'
import am5geodata_region_usa_caLow from '@amcharts/amcharts5-geodata/region/usa/caLow'
import am5geodata_region_usa_coLow from '@amcharts/amcharts5-geodata/region/usa/coLow'
import am5geodata_region_usa_ctLow from '@amcharts/amcharts5-geodata/region/usa/ctLow'
import am5geodata_region_usa_deLow from '@amcharts/amcharts5-geodata/region/usa/deLow'
import am5geodata_region_usa_flLow from '@amcharts/amcharts5-geodata/region/usa/flLow'
import am5geodata_region_usa_gaLow from '@amcharts/amcharts5-geodata/region/usa/gaLow'
import am5geodata_region_usa_hiLow from '@amcharts/amcharts5-geodata/region/usa/hiLow'
import am5geodata_region_usa_idLow from '@amcharts/amcharts5-geodata/region/usa/idLow'
import am5geodata_region_usa_ilLow from '@amcharts/amcharts5-geodata/region/usa/ilLow'
import am5geodata_region_usa_inLow from '@amcharts/amcharts5-geodata/region/usa/inLow'
import am5geodata_region_usa_iaLow from '@amcharts/amcharts5-geodata/region/usa/iaLow'
import am5geodata_region_usa_ksLow from '@amcharts/amcharts5-geodata/region/usa/ksLow'
import am5geodata_region_usa_kyLow from '@amcharts/amcharts5-geodata/region/usa/kyLow'
import am5geodata_region_usa_laLow from '@amcharts/amcharts5-geodata/region/usa/laLow'
import am5geodata_region_usa_meLow from '@amcharts/amcharts5-geodata/region/usa/meLow'
import am5geodata_region_usa_mdLow from '@amcharts/amcharts5-geodata/region/usa/mdLow'
import am5geodata_region_usa_maLow from '@amcharts/amcharts5-geodata/region/usa/maLow'
import am5geodata_region_usa_miLow from '@amcharts/amcharts5-geodata/region/usa/miLow'
import am5geodata_region_usa_mnLow from '@amcharts/amcharts5-geodata/region/usa/mnLow'
import am5geodata_region_usa_msLow from '@amcharts/amcharts5-geodata/region/usa/msLow'
import am5geodata_region_usa_moLow from '@amcharts/amcharts5-geodata/region/usa/moLow'
import am5geodata_region_usa_mtLow from '@amcharts/amcharts5-geodata/region/usa/mtLow'
import am5geodata_region_usa_neLow from '@amcharts/amcharts5-geodata/region/usa/neLow'
import am5geodata_region_usa_nvLow from '@amcharts/amcharts5-geodata/region/usa/nvLow'
import am5geodata_region_usa_nhLow from '@amcharts/amcharts5-geodata/region/usa/nhLow'
import am5geodata_region_usa_njLow from '@amcharts/amcharts5-geodata/region/usa/njLow'
import am5geodata_region_usa_nmLow from '@amcharts/amcharts5-geodata/region/usa/nmLow'
import am5geodata_region_usa_nyLow from '@amcharts/amcharts5-geodata/region/usa/nyLow'
import am5geodata_region_usa_ncLow from '@amcharts/amcharts5-geodata/region/usa/ncLow'
import am5geodata_region_usa_ndLow from '@amcharts/amcharts5-geodata/region/usa/ndLow'
import am5geodata_region_usa_ohLow from '@amcharts/amcharts5-geodata/region/usa/ohLow'
import am5geodata_region_usa_okLow from '@amcharts/amcharts5-geodata/region/usa/okLow'
import am5geodata_region_usa_orLow from '@amcharts/amcharts5-geodata/region/usa/orLow'
import am5geodata_region_usa_paLow from '@amcharts/amcharts5-geodata/region/usa/paLow'
import am5geodata_region_usa_riLow from '@amcharts/amcharts5-geodata/region/usa/riLow'
import am5geodata_region_usa_scLow from '@amcharts/amcharts5-geodata/region/usa/scLow'
import am5geodata_region_usa_sdLow from '@amcharts/amcharts5-geodata/region/usa/sdLow'
import am5geodata_region_usa_tnLow from '@amcharts/amcharts5-geodata/region/usa/tnLow'
import am5geodata_region_usa_txLow from '@amcharts/amcharts5-geodata/region/usa/txLow'
import am5geodata_region_usa_utLow from '@amcharts/amcharts5-geodata/region/usa/utLow'
import am5geodata_region_usa_vtLow from '@amcharts/amcharts5-geodata/region/usa/vtLow'
import am5geodata_region_usa_vaLow from '@amcharts/amcharts5-geodata/region/usa/vaLow'
import am5geodata_region_usa_waLow from '@amcharts/amcharts5-geodata/region/usa/waLow'
import am5geodata_region_usa_wvLow from '@amcharts/amcharts5-geodata/region/usa/wvLow'
import am5geodata_region_usa_wiLow from '@amcharts/amcharts5-geodata/region/usa/wiLow'
import am5geodata_region_usa_wyLow from '@amcharts/amcharts5-geodata/region/usa/wyLow'
import am5geodata_region_usa_dcLow from '@amcharts/amcharts5-geodata/region/usa/dcLow'

// Map state codes to their geodata
const COUNTY_GEODATA_MAP = {
  'al': am5geodata_region_usa_alLow,
  'ak': am5geodata_region_usa_akLow,
  'az': am5geodata_region_usa_azLow,
  'ar': am5geodata_region_usa_arLow,
  'ca': am5geodata_region_usa_caLow,
  'co': am5geodata_region_usa_coLow,
  'ct': am5geodata_region_usa_ctLow,
  'de': am5geodata_region_usa_deLow,
  'fl': am5geodata_region_usa_flLow,
  'ga': am5geodata_region_usa_gaLow,
  'hi': am5geodata_region_usa_hiLow,
  'id': am5geodata_region_usa_idLow,
  'il': am5geodata_region_usa_ilLow,
  'in': am5geodata_region_usa_inLow,
  'ia': am5geodata_region_usa_iaLow,
  'ks': am5geodata_region_usa_ksLow,
  'ky': am5geodata_region_usa_kyLow,
  'la': am5geodata_region_usa_laLow,
  'me': am5geodata_region_usa_meLow,
  'md': am5geodata_region_usa_mdLow,
  'ma': am5geodata_region_usa_maLow,
  'mi': am5geodata_region_usa_miLow,
  'mn': am5geodata_region_usa_mnLow,
  'ms': am5geodata_region_usa_msLow,
  'mo': am5geodata_region_usa_moLow,
  'mt': am5geodata_region_usa_mtLow,
  'ne': am5geodata_region_usa_neLow,
  'nv': am5geodata_region_usa_nvLow,
  'nh': am5geodata_region_usa_nhLow,
  'nj': am5geodata_region_usa_njLow,
  'nm': am5geodata_region_usa_nmLow,
  'ny': am5geodata_region_usa_nyLow,
  'nc': am5geodata_region_usa_ncLow,
  'nd': am5geodata_region_usa_ndLow,
  'oh': am5geodata_region_usa_ohLow,
  'ok': am5geodata_region_usa_okLow,
  'or': am5geodata_region_usa_orLow,
  'pa': am5geodata_region_usa_paLow,
  'ri': am5geodata_region_usa_riLow,
  'sc': am5geodata_region_usa_scLow,
  'sd': am5geodata_region_usa_sdLow,
  'tn': am5geodata_region_usa_tnLow,
  'tx': am5geodata_region_usa_txLow,
  'ut': am5geodata_region_usa_utLow,
  'vt': am5geodata_region_usa_vtLow,
  'va': am5geodata_region_usa_vaLow,
  'wa': am5geodata_region_usa_waLow,
  'wv': am5geodata_region_usa_wvLow,
  'wi': am5geodata_region_usa_wiLow,
  'wy': am5geodata_region_usa_wyLow,
  'dc': am5geodata_region_usa_dcLow
}

// State name to abbreviation mapping (lowercase for geodata imports)
const STATE_NAME_TO_ABBR = {
  'Alabama': 'al', 'Alaska': 'ak', 'Arizona': 'az', 'Arkansas': 'ar',
  'California': 'ca', 'Colorado': 'co', 'Connecticut': 'ct', 'Delaware': 'de',
  'Florida': 'fl', 'Georgia': 'ga', 'Hawaii': 'hi', 'Idaho': 'id',
  'Illinois': 'il', 'Indiana': 'in', 'Iowa': 'ia', 'Kansas': 'ks',
  'Kentucky': 'ky', 'Louisiana': 'la', 'Maine': 'me', 'Maryland': 'md',
  'Massachusetts': 'ma', 'Michigan': 'mi', 'Minnesota': 'mn', 'Mississippi': 'ms',
  'Missouri': 'mo', 'Montana': 'mt', 'Nebraska': 'ne', 'Nevada': 'nv',
  'New Hampshire': 'nh', 'New Jersey': 'nj', 'New Mexico': 'nm', 'New York': 'ny',
  'North Carolina': 'nc', 'North Dakota': 'nd', 'Ohio': 'oh', 'Oklahoma': 'ok',
  'Oregon': 'or', 'Pennsylvania': 'pa', 'Rhode Island': 'ri', 'South Carolina': 'sc',
  'South Dakota': 'sd', 'Tennessee': 'tn', 'Texas': 'tx', 'Utah': 'ut',
  'Vermont': 'vt', 'Virginia': 'va', 'Washington': 'wa', 'West Virginia': 'wv',
  'Wisconsin': 'wi', 'Wyoming': 'wy', 'District of Columbia': 'dc'
}

// State FIPS codes for filtering counties
const STATE_FIPS = {
  'AL': '01', 'AK': '02', 'AZ': '04', 'AR': '05', 'CA': '06', 'CO': '08',
  'CT': '09', 'DE': '10', 'FL': '12', 'GA': '13', 'HI': '15', 'ID': '16',
  'IL': '17', 'IN': '18', 'IA': '19', 'KS': '20', 'KY': '21', 'LA': '22',
  'ME': '23', 'MD': '24', 'MA': '25', 'MI': '26', 'MN': '27', 'MS': '28',
  'MO': '29', 'MT': '30', 'NE': '31', 'NV': '32', 'NH': '33', 'NJ': '34',
  'NM': '35', 'NY': '36', 'NC': '37', 'ND': '38', 'OH': '39', 'OK': '40',
  'OR': '41', 'PA': '42', 'RI': '44', 'SC': '45', 'SD': '46', 'TN': '47',
  'TX': '48', 'UT': '49', 'VT': '50', 'VA': '51', 'WA': '53', 'WV': '54',
  'WI': '55', 'WY': '56', 'DC': '11'
}

// Map cities to their counties (Alabama)
const CITY_TO_COUNTY_AL = {
  'birmingham': 'jefferson',
  'montgomery': 'montgomery',
  'mobile': 'mobile',
  'huntsville': 'madison',
  'tuscaloosa': 'tuscaloosa',
  'hoover': 'jefferson',
  'dothan': 'houston',
  'auburn': 'lee',
  'decatur': 'morgan',
  'madison': 'madison',
  'florence': 'lauderdale',
  'gadsden': 'etowah',
  'vestavia hills': 'jefferson',
  'prattville': 'autauga',
  'phenix city': 'russell',
  'alabaster': 'shelby',
  'bessemer': 'jefferson',
  'enterprise': 'coffee',
  'opelika': 'lee',
  'homewood': 'jefferson',
  'northport': 'tuscaloosa',
  'anniston': 'calhoun',
  'prichard': 'mobile',
  'athens': 'limestone',
  'daphne': 'baldwin',
  'pelham': 'shelby',
  'oxford': 'calhoun',
  'mountain brook': 'jefferson',
  'trussville': 'jefferson',
  'hueytown': 'jefferson',
  'cullman': 'cullman',
  'troy': 'pike',
  'fairhope': 'baldwin',
  'ozark': 'dale',
  'selma': 'dallas',
  'muscle shoals': 'colbert'
}

// Map cities to their counties (Alaska)
const CITY_TO_COUNTY_AK = {
  'anchorage': 'anchorage',
  'fairbanks': 'fairbanks north star',
  'juneau': 'juneau',
  'badger': 'fairbanks north star',
  'knik-fairview': 'matanuska-susitna',
  'college': 'fairbanks north star',
  'sitka': 'sitka',
  'lakes': 'matanuska-susitna',
  'tanaina': 'matanuska-susitna',
  'ketchikan': 'ketchikan gateway',
  'wasilla': 'matanuska-susitna',
  'kenai': 'kenai peninsula',
  'bethel': 'bethel',
  'palmer': 'matanuska-susitna',
  'chugiak': 'anchorage',
  'nome': 'nome',
  'kodiak': 'kodiak island',
  'soldotna': 'kenai peninsula',
  'homer': 'kenai peninsula',
  'unalaska': 'aleutians west',
  'barrow': 'north slope',
  'utqiagvik': 'north slope'
}

// Map cities to their counties (Arizona)
const CITY_TO_COUNTY_AZ = {
  'phoenix': 'maricopa',
  'tucson': 'pima',
  'mesa': 'maricopa',
  'chandler': 'maricopa',
  'scottsdale': 'maricopa',
  'glendale': 'maricopa',
  'gilbert': 'maricopa',
  'tempe': 'maricopa',
  'peoria': 'maricopa',
  'surprise': 'maricopa',
  'yuma': 'yuma',
  'avondale': 'maricopa',
  'goodyear': 'maricopa',
  'flagstaff': 'coconino',
  'buckeye': 'maricopa',
  'lake havasu city': 'mohave',
  'casa grande': 'pinal',
  'sierra vista': 'cochise',
  'maricopa': 'pinal',
  'oro valley': 'pima',
  'prescott': 'yavapai',
  'bullhead city': 'mohave',
  'prescott valley': 'yavapai',
  'apache junction': 'pinal',
  'marana': 'pima',
  'el mirage': 'maricopa',
  'san luis': 'yuma',
  'catalina foothills': 'pima',
  'queen creek': 'maricopa',
  'fountain hills': 'maricopa',
  'kingman': 'mohave',
  'anthem': 'maricopa',
  'sun city': 'maricopa',
  'sun city west': 'maricopa',
  'paradise valley': 'maricopa',
  'green valley': 'pima'
}

// Map cities to their counties (Arkansas)
const CITY_TO_COUNTY_AR = {
  'little rock': 'pulaski',
  'fort smith': 'sebastian',
  'fayetteville': 'washington',
  'springdale': 'washington',
  'jonesboro': 'craighead',
  'north little rock': 'pulaski',
  'conway': 'faulkner',
  'rogers': 'benton',
  'bentonville': 'benton',
  'pine bluff': 'jefferson',
  'hot springs': 'garland',
  'benton': 'saline',
  'sherwood': 'pulaski',
  'texarkana': 'miller',
  'russellville': 'pope',
  'jacksonville': 'pulaski',
  'bella vista': 'benton',
  'paragould': 'greene',
  'cabot': 'lonoke',
  'searcy': 'white',
  'van buren': 'crawford',
  'el dorado': 'union',
  'west memphis': 'crittenden',
  'bryant': 'saline',
  'siloam springs': 'benton',
  'hot springs village': 'garland',
  'marion': 'crittenden',
  'maumelle': 'pulaski',
  'blytheville': 'mississippi',
  'forrest city': 'st. francis',
  'camden': 'ouachita',
  'mountain home': 'baxter',
  'arkadelphia': 'clark',
  'hope': 'hempstead',
  'magnolia': 'columbia'
}

// Map cities to their counties (Colorado)
const CITY_TO_COUNTY_CO = {
  'denver': 'denver',
  'colorado springs': 'el paso',
  'aurora': 'arapahoe',
  'fort collins': 'larimer',
  'lakewood': 'jefferson',
  'thornton': 'adams',
  'arvada': 'jefferson',
  'westminster': 'adams',
  'pueblo': 'pueblo',
  'centennial': 'arapahoe',
  'boulder': 'boulder',
  'greeley': 'weld',
  'longmont': 'boulder',
  'loveland': 'larimer',
  'grand junction': 'mesa',
  'broomfield': 'broomfield',
  'castle rock': 'douglas',
  'commerce city': 'adams',
  'parker': 'douglas',
  'littleton': 'arapahoe',
  'northglenn': 'adams',
  'englewood': 'arapahoe',
  'wheat ridge': 'jefferson',
  'highlands ranch': 'douglas',
  'fountain': 'el paso',
  'golden': 'jefferson',
  'montrose': 'montrose',
  'windsor': 'weld',
  'fort morgan': 'morgan',
  'durango': 'la plata',
  'greenwood village': 'arapahoe',
  'erie': 'weld',
  'evans': 'weld',
  'lafayette': 'boulder',
  'louisville': 'boulder',
  'brighton': 'adams',
  'steamboat springs': 'routt',
  'vail': 'eagle'
}

// Map cities to their counties (Connecticut)
const CITY_TO_COUNTY_CT = {
  'bridgeport': 'fairfield',
  'new haven': 'new haven',
  'stamford': 'fairfield',
  'hartford': 'hartford',
  'waterbury': 'new haven',
  'norwalk': 'fairfield',
  'danbury': 'fairfield',
  'new britain': 'hartford',
  'meriden': 'new haven',
  'bristol': 'hartford',
  'west haven': 'new haven',
  'milford': 'new haven',
  'middletown': 'middlesex',
  'shelton': 'fairfield',
  'torrington': 'litchfield',
  'stratford': 'fairfield',
  'east hartford': 'hartford',
  'trumbull': 'fairfield',
  'new london': 'new london',
  'westport': 'fairfield',
  'greenwich': 'fairfield',
  'hamden': 'new haven',
  'manchester': 'hartford',
  'west hartford': 'hartford',
  'fairfield': 'fairfield',
  'glastonbury': 'hartford',
  'newington': 'hartford',
  'naugatuck': 'new haven',
  'groton': 'new london',
  'vernon': 'tolland',
  'windsor': 'hartford',
  'cheshire': 'new haven',
  'enfield': 'hartford',
  'ridgefield': 'fairfield',
  'darien': 'fairfield'
}

// Map cities to their counties (Delaware)
const CITY_TO_COUNTY_DE = {
  'wilmington': 'new castle',
  'dover': 'kent',
  'newark': 'new castle',
  'middletown': 'new castle',
  'smyrna': 'kent',
  'milford': 'kent',
  'seaford': 'sussex',
  'georgetown': 'sussex',
  'elsmere': 'new castle',
  'new castle': 'new castle',
  'millsboro': 'sussex',
  'lewes': 'sussex',
  'rehoboth beach': 'sussex',
  'delmar': 'sussex',
  'laurel': 'sussex',
  'harrington': 'kent',
  'camden': 'kent',
  'clayton': 'kent',
  'bridgeville': 'sussex',
  'bethany beach': 'sussex',
  'selbyville': 'sussex',
  'ocean view': 'sussex'
}

// Map cities to their counties (Georgia)
const CITY_TO_COUNTY_GA = {
  'atlanta': 'fulton',
  'columbus': 'muscogee',
  'augusta': 'richmond',
  'macon': 'bibb',
  'savannah': 'chatham',
  'athens': 'clarke',
  'sandy springs': 'fulton',
  'roswell': 'fulton',
  'johns creek': 'fulton',
  'albany': 'dougherty',
  'warner robins': 'houston',
  'alpharetta': 'fulton',
  'marietta': 'cobb',
  'valdosta': 'lowndes',
  'smyrna': 'cobb',
  'dunwoody': 'dekalb',
  'rome': 'floyd',
  'east point': 'fulton',
  'milton': 'fulton',
  'peachtree corners': 'gwinnett',
  'gainesville': 'hall',
  'brookhaven': 'dekalb',
  'peachtree city': 'fayette',
  'kennesaw': 'cobb',
  'dalton': 'whitfield',
  'hinesville': 'liberty',
  'acworth': 'cobb',
  'douglasville': 'douglas',
  'lawrenceville': 'gwinnett',
  'newnan': 'coweta',
  'decatur': 'dekalb',
  'martinez': 'columbia',
  'woodstock': 'cherokee',
  'stockbridge': 'henry',
  'conyers': 'rockdale',
  'stone mountain': 'dekalb',
  'carrollton': 'carroll',
  'pooler': 'chatham',
  'cartersville': 'bartow',
  'duluth': 'gwinnett'
}

// Map cities to their counties (Hawaii)
const CITY_TO_COUNTY_HI = {
  'honolulu': 'honolulu',
  'pearl city': 'honolulu',
  'hilo': 'hawaii',
  'kailua': 'honolulu',
  'waipahu': 'honolulu',
  'kaneohe': 'honolulu',
  'mililani': 'honolulu',
  'ewa beach': 'honolulu',
  'kahului': 'maui',
  'kihei': 'maui',
  'wailuku': 'maui',
  'kapolei': 'honolulu',
  'wahiawa': 'honolulu',
  'schofield barracks': 'honolulu',
  'makakilo': 'honolulu',
  'waimalu': 'honolulu',
  'halawa': 'honolulu',
  'waianae': 'honolulu',
  'lahaina': 'maui',
  'kailua-kona': 'hawaii',
  'kapaa': 'kauai',
  'lihue': 'kauai',
  'aiea': 'honolulu',
  'nanakuli': 'honolulu'
}

// Map cities to their counties (Idaho)
const CITY_TO_COUNTY_ID = {
  'boise': 'ada',
  'nampa': 'canyon',
  'meridian': 'ada',
  'idaho falls': 'bonneville',
  'pocatello': 'bannock',
  'caldwell': 'canyon',
  'coeur d\'alene': 'kootenai',
  'twin falls': 'twin falls',
  'lewiston': 'nez perce',
  'post falls': 'kootenai',
  'rexburg': 'madison',
  'eagle': 'ada',
  'kuna': 'ada',
  'moscow': 'latah',
  'ammon': 'bonneville',
  'mountain home': 'elmore',
  'chubbuck': 'bannock',
  'blackfoot': 'bingham',
  'garden city': 'ada',
  'hayden': 'kootenai',
  'burley': 'cassia',
  'payette': 'payette',
  'sandpoint': 'bonner',
  'jerome': 'jerome',
  'hailey': 'blaine'
}

// Map cities to their counties (Illinois)
const CITY_TO_COUNTY_IL = {
  'chicago': 'cook',
  'aurora': 'kane',
  'naperville': 'dupage',
  'joliet': 'will',
  'rockford': 'winnebago',
  'springfield': 'sangamon',
  'elgin': 'kane',
  'peoria': 'peoria',
  'champaign': 'champaign',
  'waukegan': 'lake',
  'cicero': 'cook',
  'bloomington': 'mclean',
  'arlington heights': 'cook',
  'evanston': 'cook',
  'decatur': 'macon',
  'schaumburg': 'cook',
  'bolingbrook': 'will',
  'palatine': 'cook',
  'skokie': 'cook',
  'des plaines': 'cook',
  'orland park': 'cook',
  'tinley park': 'cook',
  'oak lawn': 'cook',
  'berwyn': 'cook',
  'mount prospect': 'cook',
  'normal': 'mclean',
  'wheaton': 'dupage',
  'hoffman estates': 'cook',
  'oak park': 'cook',
  'downers grove': 'dupage',
  'elmhurst': 'dupage',
  'glenview': 'cook',
  'dekalb': 'dekalb',
  'lombard': 'dupage',
  'moline': 'rock island',
  'buffalo grove': 'lake',
  'bartlett': 'cook',
  'urbana': 'champaign',
  'crystal lake': 'mchenry',
  'quincy': 'adams'
}

// Map cities to their counties (Indiana)
const CITY_TO_COUNTY_IN = {
  'indianapolis': 'marion',
  'fort wayne': 'allen',
  'evansville': 'vanderburgh',
  'south bend': 'st. joseph',
  'carmel': 'hamilton',
  'fishers': 'hamilton',
  'bloomington': 'monroe',
  'hammond': 'lake',
  'gary': 'lake',
  'muncie': 'delaware',
  'lafayette': 'tippecanoe',
  'terre haute': 'vigo',
  'kokomo': 'howard',
  'anderson': 'madison',
  'noblesville': 'hamilton',
  'greenwood': 'johnson',
  'elkhart': 'elkhart',
  'mishawaka': 'st. joseph',
  'lawrence': 'marion',
  'jeffersonville': 'clark',
  'columbus': 'bartholomew',
  'portage': 'porter',
  'new albany': 'floyd',
  'richmond': 'wayne',
  'westfield': 'hamilton',
  'valparaiso': 'porter',
  'goshen': 'elkhart',
  'merrillville': 'lake',
  'hobart': 'lake',
  'michigan city': 'laporte',
  'schererville': 'lake',
  'crown point': 'lake',
  'plainfield': 'hendricks',
  'franklin': 'johnson',
  'brownsburg': 'hendricks',
  'avon': 'hendricks'
}

// Map cities to their counties (Iowa)
const CITY_TO_COUNTY_IA = {
  'des moines': 'polk',
  'cedar rapids': 'linn',
  'davenport': 'scott',
  'sioux city': 'woodbury',
  'iowa city': 'johnson',
  'waterloo': 'black hawk',
  'council bluffs': 'pottawattamie',
  'ames': 'story',
  'west des moines': 'polk',
  'dubuque': 'dubuque',
  'ankeny': 'polk',
  'urbandale': 'polk',
  'cedar falls': 'black hawk',
  'marion': 'linn',
  'bettendorf': 'scott',
  'mason city': 'cerro gordo',
  'marshalltown': 'marshall',
  'clinton': 'clinton',
  'burlington': 'des moines',
  'ottumwa': 'wapello',
  'muscatine': 'muscatine',
  'fort dodge': 'webster',
  'coralville': 'johnson',
  'johnston': 'polk',
  'north liberty': 'johnson',
  'altoona': 'polk',
  'waukee': 'dallas',
  'clive': 'polk',
  'newton': 'jasper',
  'indianola': 'warren'
}

// Map cities to their counties (Kansas)
const CITY_TO_COUNTY_KS = {
  'wichita': 'sedgwick',
  'overland park': 'johnson',
  'kansas city': 'wyandotte',
  'kansas city area': 'johnson', // Often refers to Johnson County area
  'olathe': 'johnson',
  'topeka': 'shawnee',
  'lawrence': 'douglas',
  'shawnee': 'johnson',
  'manhattan': 'riley',
  'lenexa': 'johnson',
  'salina': 'saline',
  'hutchinson': 'reno',
  'leavenworth': 'leavenworth',
  'leawood': 'johnson',
  'dodge city': 'ford',
  'garden city': 'finney',
  'emporia': 'lyon',
  'junction city': 'geary',
  'derby': 'sedgwick',
  'prairie village': 'johnson',
  'hays': 'ellis',
  'liberal': 'seward',
  'gardner': 'johnson',
  'pittsburg': 'crawford',
  'newton': 'harvey',
  'great bend': 'barton',
  'mcpherson': 'mcpherson',
  'el dorado': 'butler',
  'ottawa': 'franklin',
  'arkansas city': 'cowley',
  'winfield': 'cowley',
  'andover': 'butler',
  'merriam': 'johnson',
  'atchison': 'atchison',
  'mission': 'johnson',
  'chanute': 'neosho',
  'coffeyville': 'montgomery',
  'independence': 'montgomery',
  'parsons': 'labette',
  'fort scott': 'bourbon',
  'stilwell': 'johnson',
  'spring hill': 'johnson',
  'augusta': 'butler',
  'lansing': 'leavenworth',
  'haysville': 'sedgwick',
  'park city': 'sedgwick',
  'bel aire': 'sedgwick',
  'maize': 'sedgwick',
  'roeland park': 'johnson',
  'fairway': 'johnson',
  'westwood': 'johnson',
  'de soto': 'johnson',
  'bonner springs': 'wyandotte',
  'paola': 'miami',
  'osawatomie': 'miami',
  'tonganoxie': 'leavenworth',
  'basehor': 'leavenworth',
  'eudora': 'douglas',
  'baldwin city': 'douglas'
}

// Map cities to their counties (California)
const CITY_TO_COUNTY_CA = {
  'los angeles': 'los angeles',
  'san francisco': 'san francisco',
  'san diego': 'san diego',
  'san jose': 'santa clara',
  'oakland': 'alameda',
  'sacramento': 'sacramento',
  'long beach': 'los angeles',
  'fresno': 'fresno',
  'bakersfield': 'kern',
  'anaheim': 'orange',
  'santa ana': 'orange',
  'riverside': 'riverside',
  'stockton': 'san joaquin',
  'irvine': 'orange',
  'fremont': 'alameda',
  'san bernardino': 'san bernardino',
  'modesto': 'stanislaus',
  'oxnard': 'ventura',
  'fontana': 'san bernardino',
  'moreno valley': 'riverside',
  'glendale': 'los angeles',
  'huntington beach': 'orange',
  'santa clarita': 'los angeles',
  'garden grove': 'orange',
  'oceanside': 'san diego',
  'rancho cucamonga': 'san bernardino',
  'ontario': 'san bernardino',
  'corona': 'riverside',
  'lancaster': 'los angeles',
  'elk grove': 'sacramento',
  'palmdale': 'los angeles',
  'salinas': 'monterey',
  'pomona': 'los angeles',
  'hayward': 'alameda',
  'escondido': 'san diego',
  'torrance': 'los angeles',
  'sunnyvale': 'santa clara',
  'orange': 'orange',
  'fullerton': 'orange',
  'pasadena': 'los angeles',
  'thousand oaks': 'ventura',
  'visalia': 'tulare',
  'simi valley': 'ventura',
  'concord': 'contra costa',
  'roseville': 'placer',
  'santa rosa': 'sonoma',
  'victorville': 'san bernardino',
  'vallejo': 'solano',
  'berkeley': 'alameda',
  'carlsbad': 'san diego',
  'fairfield': 'solano',
  'richmond': 'contra costa',
  'murrieta': 'riverside',
  'antioch': 'contra costa',
  'temecula': 'riverside',
  'inglewood': 'los angeles',
  'daly city': 'san mateo',
  'san buenaventura': 'ventura',
  'ventura': 'ventura',
  'el monte': 'los angeles',
  'downey': 'los angeles',
  'costa mesa': 'orange',
  'west covina': 'los angeles',
  'norwalk': 'los angeles',
  'burbank': 'los angeles',
  'compton': 'los angeles',
  'south gate': 'los angeles',
  'mission viejo': 'orange',
  'rialto': 'san bernardino',
  'santa maria': 'santa barbara',
  'el cajon': 'san diego',
  'san mateo': 'san mateo',
  'clovis': 'fresno',
  'redding': 'shasta',
  'vacaville': 'solano',
  'chico': 'butte',
  'redwood city': 'san mateo',
  'menlo park': 'san mateo',
  'palo alto': 'santa clara',
  'mountain view': 'santa clara',
  'santa clara': 'santa clara',
  'cupertino': 'santa clara',
  'milpitas': 'santa clara',
  'pleasanton': 'alameda',
  'livermore': 'alameda',
  'dublin': 'alameda',
  'walnut creek': 'contra costa',
  'san rafael': 'marin',
  'napa': 'napa',
  'santa barbara': 'santa barbara'
}

// Map cities to their counties (Kentucky)
const CITY_TO_COUNTY_KY = {
  'louisville': 'jefferson',
  'lexington': 'fayette',
  'bowling green': 'warren',
  'owensboro': 'daviess',
  'covington': 'kenton',
  'hopkinsville': 'christian',
  'richmond': 'madison',
  'florence': 'boone',
  'georgetown': 'scott',
  'elizabethtown': 'hardin',
  'henderson': 'henderson',
  'jeffersontown': 'jefferson',
  'frankfort': 'franklin',
  'independence': 'kenton',
  'paducah': 'mccracken',
  'nicholasville': 'jessamine',
  'madisonville': 'hopkins',
  'somerset': 'pulaski',
  'ashland': 'boyd',
  'radcliff': 'hardin',
  'erlanger': 'kenton',
  'murray': 'calloway',
  'winchester': 'clark',
  'danville': 'boyle',
  'newport': 'campbell',
  'bardstown': 'nelson',
  'fort thomas': 'campbell',
  'lawrenceburg': 'anderson',
  'shelbyville': 'shelby',
  'glasgow': 'barren'
}

// Map cities to their counties (Louisiana)
const CITY_TO_COUNTY_LA = {
  'new orleans': 'orleans',
  'baton rouge': 'east baton rouge',
  'shreveport': 'caddo',
  'lafayette': 'lafayette',
  'lake charles': 'calcasieu',
  'kenner': 'jefferson',
  'bossier city': 'bossier',
  'monroe': 'ouachita',
  'alexandria': 'rapides',
  'houma': 'terrebonne',
  'metairie': 'jefferson',
  'new iberia': 'iberia',
  'slidell': 'st. tammany',
  'central': 'east baton rouge',
  'ruston': 'lincoln',
  'hammond': 'tangipahoa',
  'sulphur': 'calcasieu',
  'zachary': 'east baton rouge',
  'natchitoches': 'natchitoches',
  'gretna': 'jefferson',
  'opelousas': 'st. landry',
  'thibodaux': 'lafourche',
  'laplace': 'st. john the baptist',
  'mandeville': 'st. tammany',
  'baker': 'east baton rouge',
  'chalmette': 'st. bernard',
  'covington': 'st. tammany',
  'crowley': 'acadia',
  'morgan city': 'st. mary',
  'bogalusa': 'washington'
}

// Map cities to their counties (Maine)
const CITY_TO_COUNTY_ME = {
  'portland': 'cumberland',
  'lewiston': 'androscoggin',
  'bangor': 'penobscot',
  'south portland': 'cumberland',
  'auburn': 'androscoggin',
  'biddeford': 'york',
  'sanford': 'york',
  'saco': 'york',
  'westbrook': 'cumberland',
  'augusta': 'kennebec',
  'waterville': 'kennebec',
  'presque isle': 'aroostook',
  'brewer': 'penobscot',
  'bath': 'sagadahoc',
  'caribou': 'aroostook',
  'old town': 'penobscot',
  'belfast': 'waldo',
  'kennebunk': 'york',
  'gardiner': 'kennebec',
  'rockland': 'knox',
  'york': 'york',
  'falmouth': 'cumberland',
  'ellsworth': 'hancock',
  'brunswick': 'cumberland',
  'scarborough': 'cumberland'
}

// Map cities to their counties (Maryland)
const CITY_TO_COUNTY_MD = {
  'baltimore': 'baltimore city',
  'columbia': 'howard',
  'germantown': 'montgomery',
  'silver spring': 'montgomery',
  'waldorf': 'charles',
  'glen burnie': 'anne arundel',
  'ellicott city': 'howard',
  'frederick': 'frederick',
  'dundalk': 'baltimore',
  'rockville': 'montgomery',
  'bethesda': 'montgomery',
  'gaithersburg': 'montgomery',
  'bowie': 'prince george\'s',
  'hagerstown': 'washington',
  'annapolis': 'anne arundel',
  'college park': 'prince george\'s',
  'salisbury': 'wicomico',
  'laurel': 'prince george\'s',
  'greenbelt': 'prince george\'s',
  'cumberland': 'allegany',
  'westminster': 'carroll',
  'hyattsville': 'prince george\'s',
  'takoma park': 'montgomery',
  'towson': 'baltimore',
  'bel air': 'harford',
  'wheaton': 'montgomery',
  'potomac': 'montgomery',
  'aspen hill': 'montgomery',
  'parkville': 'baltimore',
  'severn': 'anne arundel'
}

// Map cities to their counties (Massachusetts)
const CITY_TO_COUNTY_MA = {
  'boston': 'suffolk',
  'worcester': 'worcester',
  'springfield': 'hampden',
  'cambridge': 'middlesex',
  'lowell': 'middlesex',
  'brockton': 'plymouth',
  'quincy': 'norfolk',
  'lynn': 'essex',
  'new bedford': 'bristol',
  'newton': 'middlesex',
  'somerville': 'middlesex',
  'lawrence': 'essex',
  'framingham': 'middlesex',
  'haverhill': 'essex',
  'waltham': 'middlesex',
  'malden': 'middlesex',
  'brookline': 'norfolk',
  'plymouth': 'plymouth',
  'medford': 'middlesex',
  'taunton': 'bristol',
  'revere': 'suffolk',
  'chicopee': 'hampden',
  'weymouth': 'norfolk',
  'peabody': 'essex',
  'methuen': 'essex',
  'barnstable': 'barnstable',
  'pittsfield': 'berkshire',
  'fall river': 'bristol',
  'attleboro': 'bristol',
  'salem': 'essex',
  'beverly': 'essex',
  'woburn': 'middlesex',
  'chelsea': 'suffolk',
  'everett': 'middlesex',
  'arlington': 'middlesex',
  'leominster': 'worcester',
  'fitchburg': 'worcester',
  'billerica': 'middlesex',
  'holyoke': 'hampden'
}

// Map cities to their counties (Michigan)
const CITY_TO_COUNTY_MI = {
  'detroit': 'wayne',
  'grand rapids': 'kent',
  'warren': 'macomb',
  'sterling heights': 'macomb',
  'ann arbor': 'washtenaw',
  'lansing': 'ingham',
  'flint': 'genesee',
  'dearborn': 'wayne',
  'livonia': 'wayne',
  'westland': 'wayne',
  'troy': 'oakland',
  'farmington hills': 'oakland',
  'kalamazoo': 'kalamazoo',
  'wyoming': 'kent',
  'southfield': 'oakland',
  'rochester hills': 'oakland',
  'taylor': 'wayne',
  'pontiac': 'oakland',
  'st. clair shores': 'macomb',
  'royal oak': 'oakland',
  'novi': 'oakland',
  'dearborn heights': 'wayne',
  'battle creek': 'calhoun',
  'saginaw': 'saginaw',
  'kentwood': 'kent',
  'east lansing': 'ingham',
  'roseville': 'macomb',
  'portage': 'kalamazoo',
  'midland': 'midland',
  'lincoln park': 'wayne',
  'muskegon': 'muskegon',
  'holland': 'ottawa',
  'jackson': 'jackson',
  'allen park': 'wayne',
  'bay city': 'bay',
  'canton': 'wayne',
  'bloomfield hills': 'oakland',
  'birmingham': 'oakland'
}

// Map cities to their counties (Minnesota)
const CITY_TO_COUNTY_MN = {
  'minneapolis': 'hennepin',
  'st. paul': 'ramsey',
  'rochester': 'olmsted',
  'duluth': 'st. louis',
  'bloomington': 'hennepin',
  'brooklyn park': 'hennepin',
  'plymouth': 'hennepin',
  'st. cloud': 'stearns',
  'eagan': 'dakota',
  'woodbury': 'washington',
  'maple grove': 'hennepin',
  'eden prairie': 'hennepin',
  'coon rapids': 'anoka',
  'burnsville': 'dakota',
  'blaine': 'anoka',
  'lakeville': 'dakota',
  'minnetonka': 'hennepin',
  'apple valley': 'dakota',
  'edina': 'hennepin',
  'st. louis park': 'hennepin',
  'mankato': 'blue earth',
  'moorhead': 'clay',
  'shakopee': 'scott',
  'maplewood': 'ramsey',
  'richfield': 'hennepin',
  'cottage grove': 'washington',
  'roseville': 'ramsey',
  'inver grove heights': 'dakota',
  'andover': 'anoka',
  'brooklyn center': 'hennepin',
  'savage': 'scott',
  'fridley': 'anoka',
  'prior lake': 'scott',
  'owatonna': 'steele',
  'faribault': 'rice',
  'golden valley': 'hennepin',
  'oakdale': 'washington',
  'ramsey': 'anoka',
  'chaska': 'carver',
  'white bear lake': 'ramsey'
}

// Map cities to their counties (Mississippi)
const CITY_TO_COUNTY_MS = {
  'jackson': 'hinds',
  'gulfport': 'harrison',
  'southaven': 'desoto',
  'hattiesburg': 'forrest',
  'biloxi': 'harrison',
  'meridian': 'lauderdale',
  'tupelo': 'lee',
  'greenville': 'washington',
  'olive branch': 'desoto',
  'horn lake': 'desoto',
  'clinton': 'hinds',
  'pearl': 'rankin',
  'madison': 'madison',
  'ridgeland': 'madison',
  'starkville': 'oktibbeha',
  'columbus': 'lowndes',
  'vicksburg': 'warren',
  'pascagoula': 'jackson',
  'brandon': 'rankin',
  'gautier': 'jackson',
  'ocean springs': 'jackson',
  'clarksdale': 'coahoma',
  'natchez': 'adams',
  'laurel': 'jones',
  'corinth': 'alcorn'
}

// Map cities to their counties (Missouri)
const CITY_TO_COUNTY_MO = {
  'kansas city': 'jackson',
  'st. louis': 'st. louis city',
  'springfield': 'greene',
  'columbia': 'boone',
  'independence': 'jackson',
  'lee\'s summit': 'jackson',
  'o\'fallon': 'st. charles',
  'st. joseph': 'buchanan',
  'st. charles': 'st. charles',
  'st. peters': 'st. charles',
  'blue springs': 'jackson',
  'florissant': 'st. louis',
  'joplin': 'jasper',
  'chesterfield': 'st. louis',
  'jefferson city': 'cole',
  'cape girardeau': 'cape girardeau',
  'wentzville': 'st. charles',
  'wildwood': 'st. louis',
  'university city': 'st. louis',
  'ballwin': 'st. louis',
  'raytown': 'jackson',
  'liberty': 'clay',
  'hazelwood': 'st. louis',
  'gladstone': 'clay',
  'grandview': 'jackson',
  'belton': 'cass',
  'kirkwood': 'st. louis',
  'maryland heights': 'st. louis',
  'sedalia': 'pettis',
  'rolla': 'phelps',
  'creve coeur': 'st. louis',
  'webster groves': 'st. louis',
  'ferguson': 'st. louis',
  'arnold': 'jefferson',
  'affton': 'st. louis'
}

// Map cities to their counties (Montana)
const CITY_TO_COUNTY_MT = {
  'billings': 'yellowstone',
  'missoula': 'missoula',
  'great falls': 'cascade',
  'bozeman': 'gallatin',
  'butte': 'silver bow',
  'helena': 'lewis and clark',
  'kalispell': 'flathead',
  'havre': 'hill',
  'anaconda': 'deer lodge',
  'miles city': 'custer',
  'belgrade': 'gallatin',
  'livingston': 'park',
  'laurel': 'yellowstone',
  'whitefish': 'flathead',
  'lewistown': 'fergus',
  'sidney': 'richland',
  'glendive': 'dawson',
  'polson': 'lake',
  'columbia falls': 'flathead'
}

// Map cities to their counties (Nebraska)
const CITY_TO_COUNTY_NE = {
  'omaha': 'douglas',
  'lincoln': 'lancaster',
  'bellevue': 'sarpy',
  'grand island': 'hall',
  'kearney': 'buffalo',
  'fremont': 'dodge',
  'hastings': 'adams',
  'norfolk': 'madison',
  'columbus': 'platte',
  'papillion': 'sarpy',
  'la vista': 'sarpy',
  'scottsbluff': 'scotts bluff',
  'south sioux city': 'dakota',
  'beatrice': 'gage',
  'lexington': 'dawson',
  'gering': 'scotts bluff',
  'alliance': 'box butte',
  'blair': 'washington',
  'york': 'york',
  'mccook': 'red willow',
  'nebraska city': 'otoe',
  'seward': 'seward',
  'crete': 'saline',
  'plattsmouth': 'cass',
  'sidney': 'cheyenne'
}

// Map cities to their counties (Nevada)
const CITY_TO_COUNTY_NV = {
  'las vegas': 'clark',
  'henderson': 'clark',
  'reno': 'washoe',
  'north las vegas': 'clark',
  'sparks': 'washoe',
  'carson city': 'carson city',
  'fernley': 'lyon',
  'elko': 'elko',
  'mesquite': 'clark',
  'boulder city': 'clark',
  'fallon': 'churchill',
  'winnemucca': 'humboldt',
  'west wendover': 'elko',
  'ely': 'white pine',
  'yerington': 'lyon',
  'carlin': 'elko',
  'lovelock': 'pershing',
  'paradise': 'clark',
  'spring valley': 'clark',
  'sunrise manor': 'clark',
  'enterprise': 'clark',
  'summerlin': 'clark'
}

// Map cities to their counties (New Hampshire)
const CITY_TO_COUNTY_NH = {
  'manchester': 'hillsborough',
  'nashua': 'hillsborough',
  'concord': 'merrimack',
  'derry': 'rockingham',
  'rochester': 'strafford',
  'salem': 'rockingham',
  'merrimack': 'hillsborough',
  'hudson': 'hillsborough',
  'londonderry': 'rockingham',
  'keene': 'cheshire',
  'bedford': 'hillsborough',
  'portsmouth': 'rockingham',
  'goffstown': 'hillsborough',
  'laconia': 'belknap',
  'hampton': 'rockingham',
  'milford': 'hillsborough',
  'durham': 'strafford',
  'exeter': 'rockingham',
  'windham': 'rockingham',
  'dover': 'strafford',
  'claremont': 'sullivan',
  'lebanon': 'grafton',
  'pelham': 'hillsborough',
  'somersworth': 'strafford'
}

// Map cities to their counties (New Jersey)
const CITY_TO_COUNTY_NJ = {
  'newark': 'essex',
  'jersey city': 'hudson',
  'paterson': 'passaic',
  'elizabeth': 'union',
  'edison': 'middlesex',
  'woodbridge': 'middlesex',
  'lakewood': 'ocean',
  'toms river': 'ocean',
  'hamilton': 'mercer',
  'trenton': 'mercer',
  'clifton': 'passaic',
  'camden': 'camden',
  'brick': 'ocean',
  'cherry hill': 'camden',
  'passaic': 'passaic',
  'union city': 'hudson',
  'old bridge': 'middlesex',
  'gloucester': 'camden',
  'east orange': 'essex',
  'bayonne': 'hudson',
  'franklin': 'somerset',
  'north bergen': 'hudson',
  'vineland': 'cumberland',
  'union': 'union',
  'piscataway': 'middlesex',
  'new brunswick': 'middlesex',
  'jackson': 'ocean',
  'wayne': 'passaic',
  'irvington': 'essex',
  'parsippany': 'morris',
  'hoboken': 'hudson',
  'west new york': 'hudson',
  'plainfield': 'union',
  'hackensack': 'bergen',
  'sayreville': 'middlesex',
  'kearny': 'hudson',
  'linden': 'union',
  'atlantic city': 'atlantic',
  'fort lee': 'bergen',
  'fair lawn': 'bergen'
}

// Map cities to their counties (New Mexico)
const CITY_TO_COUNTY_NM = {
  'albuquerque': 'bernalillo',
  'las cruces': 'dona ana',
  'rio rancho': 'sandoval',
  'santa fe': 'santa fe',
  'roswell': 'chaves',
  'farmington': 'san juan',
  'clovis': 'curry',
  'hobbs': 'lea',
  'alamogordo': 'otero',
  'carlsbad': 'eddy',
  'gallup': 'mckinley',
  'deming': 'luna',
  'los alamos': 'los alamos',
  'chaparral': 'dona ana',
  'sunland park': 'dona ana',
  'las vegas': 'san miguel',
  'portales': 'roosevelt',
  'artesia': 'eddy',
  'lovington': 'lea',
  'silver city': 'grant',
  'espanola': 'rio arriba',
  'anthony': 'dona ana',
  'grants': 'cibola',
  'Socorro': 'socorro',
  'shiprock': 'san juan'
}

// Map cities to their counties (New York)
const CITY_TO_COUNTY_NY = {
  'new york': 'new york',
  'manhattan': 'new york',
  'brooklyn': 'kings',
  'queens': 'queens',
  'bronx': 'bronx',
  'staten island': 'richmond',
  'buffalo': 'erie',
  'rochester': 'monroe',
  'yonkers': 'westchester',
  'syracuse': 'onondaga',
  'albany': 'albany',
  'new rochelle': 'westchester',
  'mount vernon': 'westchester',
  'schenectady': 'schenectady',
  'utica': 'oneida',
  'white plains': 'westchester',
  'hempstead': 'nassau',
  'troy': 'rensselaer',
  'niagara falls': 'niagara',
  'binghamton': 'broome',
  'freeport': 'nassau',
  'valley stream': 'nassau',
  'long beach': 'nassau',
  'spring valley': 'rockland',
  'rome': 'oneida',
  'north tonawanda': 'niagara',
  'jamestown': 'chautauqua',
  'poughkeepsie': 'dutchess',
  'ithaca': 'tompkins',
  'middletown': 'orange',
  'newburgh': 'orange',
  'port chester': 'westchester',
  'elmira': 'chemung',
  'watertown': 'jefferson',
  'tonawanda': 'erie',
  'west seneca': 'erie',
  'saratoga springs': 'saratoga',
  'lackawanna': 'erie',
  'levittown': 'nassau'
}

// Map cities to their counties (North Carolina)
const CITY_TO_COUNTY_NC = {
  'charlotte': 'mecklenburg',
  'raleigh': 'wake',
  'greensboro': 'guilford',
  'durham': 'durham',
  'winston-salem': 'forsyth',
  'fayetteville': 'cumberland',
  'cary': 'wake',
  'wilmington': 'new hanover',
  'high point': 'guilford',
  'concord': 'cabarrus',
  'asheville': 'buncombe',
  'gastonia': 'gaston',
  'greenville': 'pitt',
  'jacksonville': 'onslow',
  'chapel hill': 'orange',
  'huntersville': 'mecklenburg',
  'burlington': 'alamance',
  'apex': 'wake',
  'rocky mount': 'edgecombe',
  'kannapolis': 'cabarrus',
  'salisbury': 'rowan',
  'holly springs': 'wake',
  'matthews': 'mecklenburg',
  'monroe': 'union',
  'indian trail': 'union',
  'mooresville': 'iredell',
  'wake forest': 'wake',
  'morrisville': 'wake',
  'hickory': 'catawba',
  'sanford': 'lee',
  'cornelius': 'mecklenburg',
  'mint hill': 'mecklenburg',
  'carrboro': 'orange',
  'garner': 'wake',
  'fuquay-varina': 'wake',
  'havelock': 'craven',
  'wilson': 'wilson',
  'kernersville': 'forsyth',
  'goldsboro': 'wayne',
  'lumberton': 'robeson'
}

// Map cities to their counties (North Dakota)
const CITY_TO_COUNTY_ND = {
  'fargo': 'cass',
  'bismarck': 'burleigh',
  'grand forks': 'grand forks',
  'minot': 'ward',
  'west fargo': 'cass',
  'williston': 'williams',
  'dickinson': 'stark',
  'mandan': 'morton',
  'jamestown': 'stutsman',
  'wahpeton': 'richland',
  'devils lake': 'ramsey',
  'valley city': 'barnes',
  'grafton': 'walsh',
  'watford city': 'mckenzie',
  'beulah': 'mercer',
  'rugby': 'pierce',
  'lincoln': 'burleigh',
  'horace': 'cass'
}

// Map cities to their counties (Ohio)
const CITY_TO_COUNTY_OH = {
  'columbus': 'franklin',
  'cleveland': 'cuyahoga',
  'cincinnati': 'hamilton',
  'toledo': 'lucas',
  'akron': 'summit',
  'dayton': 'montgomery',
  'parma': 'cuyahoga',
  'canton': 'stark',
  'youngstown': 'mahoning',
  'lorain': 'lorain',
  'hamilton': 'butler',
  'springfield': 'clark',
  'kettering': 'montgomery',
  'elyria': 'lorain',
  'lakewood': 'cuyahoga',
  'cuyahoga falls': 'summit',
  'middletown': 'butler',
  'euclid': 'cuyahoga',
  'newark': 'licking',
  'mansfield': 'richland',
  'mentor': 'lake',
  'beavercreek': 'greene',
  'cleveland heights': 'cuyahoga',
  'strongsville': 'cuyahoga',
  'dublin': 'franklin',
  'fairfield': 'butler',
  'findlay': 'hancock',
  'warren': 'trumbull',
  'lancaster': 'fairfield',
  'lima': 'allen',
  'huber heights': 'montgomery',
  'westerville': 'franklin',
  'marion': 'marion',
  'grove city': 'franklin',
  'reynoldsburg': 'franklin',
  'delaware': 'delaware',
  'upper arlington': 'franklin',
  'gahanna': 'franklin',
  'bowling green': 'wood',
  'mason': 'warren'
}

// Map cities to their counties (Oklahoma)
const CITY_TO_COUNTY_OK = {
  'oklahoma city': 'oklahoma',
  'tulsa': 'tulsa',
  'norman': 'cleveland',
  'broken arrow': 'tulsa',
  'edmond': 'oklahoma',
  'lawton': 'comanche',
  'moore': 'cleveland',
  'midwest city': 'oklahoma',
  'enid': 'garfield',
  'stillwater': 'payne',
  'muskogee': 'muskogee',
  'bartlesville': 'washington',
  'owasso': 'tulsa',
  'shawnee': 'pottawatomie',
  'ponca city': 'kay',
  'ardmore': 'carter',
  'duncan': 'stephens',
  'del city': 'oklahoma',
  'yukon': 'canadian',
  'weatherford': 'custer',
  'sapulpa': 'creek',
  'mustang': 'canadian',
  'jenks': 'tulsa',
  'sand springs': 'tulsa',
  'bethany': 'oklahoma',
  'claremore': 'rogers',
  'altus': 'jackson',
  'mcalester': 'pittsburg',
  'chickasha': 'grady',
  'el reno': 'canadian',
  'tahlequah': 'cherokee',
  'miami': 'ottawa',
  'durant': 'bryan',
  'ada': 'pontotoc'
}

// Map cities to their counties (Oregon)
const CITY_TO_COUNTY_OR = {
  'portland': 'multnomah',
  'salem': 'marion',
  'eugene': 'lane',
  'gresham': 'multnomah',
  'hillsboro': 'washington',
  'beaverton': 'washington',
  'bend': 'deschutes',
  'medford': 'jackson',
  'springfield': 'lane',
  'corvallis': 'benton',
  'albany': 'linn',
  'tigard': 'washington',
  'lake oswego': 'clackamas',
  'keizer': 'marion',
  'grants pass': 'josephine',
  'oregon city': 'clackamas',
  'mcminnville': 'yamhill',
  'redmond': 'deschutes',
  'tualatin': 'washington',
  'west linn': 'clackamas',
  'woodburn': 'marion',
  'forest grove': 'washington',
  'newberg': 'yamhill',
  'wilsonville': 'clackamas',
  'roseburg': 'douglas',
  'klamath falls': 'klamath',
  'ashland': 'jackson',
  'milwaukie': 'clackamas',
  'sherwood': 'washington',
  'happy valley': 'clackamas',
  'central point': 'jackson',
  'canby': 'clackamas',
  'hermiston': 'umatilla',
  'pendleton': 'umatilla',
  'lebanon': 'linn',
  'coos bay': 'coos'
}

// Map cities to their counties (Pennsylvania)
const CITY_TO_COUNTY_PA = {
  'philadelphia': 'philadelphia',
  'pittsburgh': 'allegheny',
  'allentown': 'lehigh',
  'erie': 'erie',
  'reading': 'berks',
  'scranton': 'lackawanna',
  'bethlehem': 'northampton',
  'lancaster': 'lancaster',
  'harrisburg': 'dauphin',
  'altoona': 'blair',
  'york': 'york',
  'state college': 'centre',
  'wilkes-barre': 'luzerne',
  'chester': 'delaware',
  'bethel park': 'allegheny',
  'monroeville': 'allegheny',
  'hazleton': 'luzerne',
  'plum': 'allegheny',
  'williamsport': 'lycoming',
  'easton': 'northampton',
  'lebanon': 'lebanon',
  'johnstown': 'cambria',
  'chambersburg': 'franklin',
  'new castle': 'lawrence',
  'norristown': 'montgomery',
  'west chester': 'chester',
  'upper darby': 'delaware',
  'lower merion': 'montgomery',
  'mt. lebanon': 'allegheny',
  'blue bell': 'montgomery',
  'ardmore': 'montgomery',
  'king of prussia': 'montgomery',
  'drexel hill': 'delaware',
  'levittown': 'bucks',
  'bensalem': 'bucks',
  'lansdale': 'montgomery',
  'media': 'delaware',
  'pottstown': 'montgomery',
  'westchester': 'chester'
}

// Map cities to their counties (Rhode Island)
const CITY_TO_COUNTY_RI = {
  'providence': 'providence',
  'warwick': 'kent',
  'cranston': 'providence',
  'pawtucket': 'providence',
  'east providence': 'providence',
  'woonsocket': 'providence',
  'coventry': 'kent',
  'cumberland': 'providence',
  'north providence': 'providence',
  'south kingstown': 'washington',
  'west warwick': 'kent',
  'johnston': 'providence',
  'north kingstown': 'washington',
  'bristol': 'bristol',
  'westerly': 'washington',
  'barrington': 'bristol',
  'smithfield': 'providence',
  'newport': 'newport',
  'lincoln': 'providence',
  'central falls': 'providence',
  'portsmouth': 'newport',
  'burrillville': 'providence',
  'middletown': 'newport',
  'tiverton': 'newport',
  'narragansett': 'washington'
}

// Map cities to their counties (South Carolina)
const CITY_TO_COUNTY_SC = {
  'columbia': 'richland',
  'charleston': 'charleston',
  'north charleston': 'charleston',
  'mount pleasant': 'charleston',
  'rock hill': 'york',
  'greenville': 'greenville',
  'summerville': 'dorchester',
  'sumter': 'sumter',
  'goose creek': 'berkeley',
  'hilton head island': 'beaufort',
  'florence': 'florence',
  'spartanburg': 'spartanburg',
  'myrtle beach': 'horry',
  'aiken': 'aiken',
  'anderson': 'anderson',
  'greer': 'greenville',
  'mauldin': 'greenville',
  'greenwood': 'greenwood',
  'north augusta': 'aiken',
  'easley': 'pickens',
  'simpsonville': 'greenville',
  'hanahan': 'berkeley',
  'lexington': 'lexington',
  'conway': 'horry',
  'cayce': 'lexington',
  'irmo': 'richland',
  'fort mill': 'york',
  'port royal': 'beaufort',
  'west columbia': 'lexington',
  'bluffton': 'beaufort',
  'tega cay': 'york',
  'beaufort': 'beaufort',
  'clemson': 'pickens',
  'socastee': 'horry'
}

// Map cities to their counties (South Dakota)
const CITY_TO_COUNTY_SD = {
  'sioux falls': 'minnehaha',
  'rapid city': 'pennington',
  'aberdeen': 'brown',
  'brookings': 'brookings',
  'watertown': 'codington',
  'mitchell': 'davison',
  'yankton': 'yankton',
  'pierre': 'hughes',
  'huron': 'beadle',
  'spearfish': 'lawrence',
  'vermillion': 'clay',
  'box elder': 'pennington',
  'brandon': 'minnehaha',
  'sturgis': 'meade',
  'belle fourche': 'butte',
  'madison': 'lake',
  'harrisburg': 'lincoln',
  'tea': 'lincoln',
  'canton': 'lincoln',
  'hot springs': 'fall river'
}

// Map cities to their counties (Tennessee)
const CITY_TO_COUNTY_TN = {
  'nashville': 'davidson',
  'memphis': 'shelby',
  'knoxville': 'knox',
  'chattanooga': 'hamilton',
  'clarksville': 'montgomery',
  'murfreesboro': 'rutherford',
  'franklin': 'williamson',
  'jackson': 'madison',
  'johnson city': 'washington',
  'bartlett': 'shelby',
  'hendersonville': 'sumner',
  'kingsport': 'sullivan',
  'collierville': 'shelby',
  'smyrna': 'rutherford',
  'cleveland': 'bradley',
  'brentwood': 'williamson',
  'germantown': 'shelby',
  'columbia': 'maury',
  'spring hill': 'maury',
  'la vergne': 'rutherford',
  'gallatin': 'sumner',
  'cookeville': 'putnam',
  'mount juliet': 'wilson',
  'lebanon': 'wilson',
  'morristown': 'hamblen',
  'oak ridge': 'anderson',
  'maryville': 'blount',
  'bristol': 'sullivan',
  'farragut': 'knox',
  'shelbyville': 'bedford',
  'east ridge': 'hamilton',
  'tullahoma': 'coffee',
  'manchester': 'coffee',
  'hermitage': 'davidson',
  'dickson': 'dickson'
}

// Map cities to their counties (Texas)
const CITY_TO_COUNTY_TX = {
  'houston': 'harris',
  'san antonio': 'bexar',
  'dallas': 'dallas',
  'austin': 'travis',
  'fort worth': 'tarrant',
  'el paso': 'el paso',
  'arlington': 'tarrant',
  'corpus christi': 'nueces',
  'plano': 'collin',
  'laredo': 'webb',
  'lubbock': 'lubbock',
  'garland': 'dallas',
  'irving': 'dallas',
  'amarillo': 'potter',
  'grand prairie': 'dallas',
  'brownsville': 'cameron',
  'pasadena': 'harris',
  'mckinney': 'collin',
  'mesquite': 'dallas',
  'killeen': 'bell',
  'frisco': 'collin',
  'waco': 'mclennan',
  'carrollton': 'dallas',
  'denton': 'denton',
  'midland': 'midland',
  'abilene': 'taylor',
  'beaumont': 'jefferson',
  'round rock': 'williamson',
  'richardson': 'dallas',
  'odessa': 'ector',
  'wichita falls': 'wichita',
  'lewisville': 'denton',
  'tyler': 'smith',
  'pearland': 'brazoria',
  'college station': 'brazos',
  'allen': 'collin',
  'league city': 'galveston',
  'sugar land': 'fort bend',
  'longview': 'gregg',
  'edinburg': 'hidalgo',
  'mission': 'hidalgo',
  'baytown': 'harris',
  'san angelo': 'tom green',
  'conroe': 'montgomery',
  'bryan': 'brazos',
  'pharr': 'hidalgo',
  'temple': 'bell',
  'missouri city': 'fort bend',
  'flower mound': 'denton',
  'harlingen': 'cameron',
  'north richland hills': 'tarrant',
  'victoria': 'victoria',
  'new braunfels': 'comal',
  'mansfield': 'tarrant',
  'cedar park': 'williamson',
  'rowlett': 'dallas',
  'port arthur': 'jefferson',
  'euless': 'tarrant',
  'georgetown': 'williamson',
  'pflugerville': 'travis',
  'desoto': 'dallas',
  'san marcos': 'hays',
  'grapevine': 'tarrant',
  'bedford': 'tarrant',
  'galveston': 'galveston',
  'cedar hill': 'dallas',
  'texas city': 'galveston',
  'wylie': 'collin',
  'haltom city': 'tarrant',
  'keller': 'tarrant',
  'coppell': 'dallas',
  'rockwall': 'rockwall',
  'huntsville': 'walker',
  'duncanville': 'dallas',
  'sherman': 'grayson',
  'the colony': 'denton',
  'burleson': 'johnson',
  'hurst': 'tarrant',
  'lancaster': 'dallas',
  'texarkana': 'bowie',
  'friendswood': 'galveston',
  'weslaco': 'hidalgo'
}

// Map cities to their counties (Utah)
const CITY_TO_COUNTY_UT = {
  'salt lake city': 'salt lake',
  'west valley city': 'salt lake',
  'provo': 'utah',
  'west jordan': 'salt lake',
  'orem': 'utah',
  'sandy': 'salt lake',
  'ogden': 'weber',
  'st. george': 'washington',
  'layton': 'davis',
  'taylorsville': 'salt lake',
  'south jordan': 'salt lake',
  'lehi': 'utah',
  'logan': 'cache',
  'murray': 'salt lake',
  'draper': 'salt lake',
  'bountiful': 'davis',
  'riverton': 'salt lake',
  'roy': 'weber',
  'spanish fork': 'utah',
  'pleasant grove': 'utah',
  'kearns': 'salt lake',
  'tooele': 'tooele',
  'cottonwood heights': 'salt lake',
  'springville': 'utah',
  'cedar city': 'iron',
  'kaysville': 'davis',
  'clearfield': 'davis',
  'midvale': 'salt lake',
  'american fork': 'utah',
  'south salt lake': 'salt lake',
  'washington': 'washington',
  'saratoga springs': 'utah',
  'holladay': 'salt lake',
  'eagle mountain': 'utah',
  'clinton': 'davis',
  'payson': 'utah',
  'herriman': 'salt lake',
  'syracuse': 'davis',
  'magna': 'salt lake',
  'north ogden': 'weber'
}

// Map cities to their counties (Vermont)
const CITY_TO_COUNTY_VT = {
  'burlington': 'chittenden',
  'south burlington': 'chittenden',
  'rutland': 'rutland',
  'barre': 'washington',
  'montpelier': 'washington',
  'essex': 'chittenden',
  'winooski': 'chittenden',
  'st. albans': 'franklin',
  'newport': 'orleans',
  'vergennes': 'addison',
  'brattleboro': 'windham',
  'bennington': 'bennington',
  'springfield': 'windsor',
  'colchester': 'chittenden',
  'williston': 'chittenden',
  'shelburne': 'chittenden',
  'st. johnsbury': 'caledonia',
  'middlebury': 'addison',
  'milton': 'chittenden',
  'swanton': 'franklin'
}

// Map cities to their counties (Virginia)
const CITY_TO_COUNTY_VA = {
  'virginia beach': 'virginia beach city',
  'norfolk': 'norfolk city',
  'chesapeake': 'chesapeake city',
  'richmond': 'richmond city',
  'newport news': 'newport news city',
  'alexandria': 'alexandria city',
  'hampton': 'hampton city',
  'roanoke': 'roanoke city',
  'portsmouth': 'portsmouth city',
  'suffolk': 'suffolk city',
  'lynchburg': 'lynchburg city',
  'harrisonburg': 'harrisonburg city',
  'leesburg': 'loudoun',
  'charlottesville': 'charlottesville city',
  'danville': 'danville city',
  'blacksburg': 'montgomery',
  'manassas': 'manassas city',
  'petersburg': 'petersburg city',
  'fredericksburg': 'fredericksburg city',
  'winchester': 'winchester city',
  'salem': 'salem city',
  'arlington': 'arlington',
  'fairfax': 'fairfax city',
  'mclean': 'fairfax',
  'centreville': 'fairfax',
  'dale city': 'prince william',
  'woodbridge': 'prince william',
  'ashburn': 'loudoun',
  'reston': 'fairfax',
  'south riding': 'loudoun',
  'herndon': 'fairfax',
  'chantilly': 'fairfax',
  'falls church': 'falls church city',
  'annandale': 'fairfax',
  'springfield': 'fairfax',
  'mechanicsville': 'hanover',
  'colonial heights': 'colonial heights city',
  'yorktown': 'york',
  'staunton': 'staunton city',
  'martinsville': 'martinsville city'
}

// Map cities to their counties (Washington)
const CITY_TO_COUNTY_WA = {
  'seattle': 'king',
  'spokane': 'spokane',
  'tacoma': 'pierce',
  'vancouver': 'clark',
  'bellevue': 'king',
  'kent': 'king',
  'everett': 'snohomish',
  'renton': 'king',
  'yakima': 'yakima',
  'federal way': 'king',
  'spokane valley': 'spokane',
  'bellingham': 'whatcom',
  'kennewick': 'benton',
  'auburn': 'king',
  'pasco': 'franklin',
  'marysville': 'snohomish',
  'lakewood': 'pierce',
  'redmond': 'king',
  'shoreline': 'king',
  'richland': 'benton',
  'kirkland': 'king',
  'burien': 'king',
  'covington': 'king',
  'sammamish': 'king',
  'olympia': 'thurston',
  'lacey': 'thurston',
  'edmonds': 'snohomish',
  'bremerton': 'kitsap',
  'puyallup': 'pierce',
  'sumner': 'pierce',
  'lynnwood': 'snohomish',
  'bothell': 'king',
  'longview': 'cowlitz',
  'pullman': 'whitman',
  'wenatchee': 'chelan',
  'des moines': 'king',
  'lake stevens': 'snohomish',
  'university place': 'pierce',
  'issaquah': 'king',
  'walla walla': 'walla walla',
  'mount vernon': 'skagit',
  'mercer island': 'king',
  'maple valley': 'king'
}

// Map cities to their counties (West Virginia)
const CITY_TO_COUNTY_WV = {
  'charleston': 'kanawha',
  'huntington': 'cabell',
  'morgantown': 'monongalia',
  'parkersburg': 'wood',
  'wheeling': 'ohio',
  'weirton': 'hancock',
  'fairmont': 'marion',
  'martinsburg': 'berkeley',
  'beckley': 'raleigh',
  'clarksburg': 'harrison',
  'south charleston': 'kanawha',
  'st. albans': 'kanawha',
  'vienna': 'wood',
  'bluefield': 'mercer',
  'moundsville': 'marshall',
  'bridgeport': 'harrison',
  'dunbar': 'kanawha',
  'oak hill': 'fayette',
  'cross lanes': 'kanawha',
  'nitro': 'kanawha',
  'princeton': 'mercer',
  'elkins': 'randolph',
  'charles town': 'jefferson',
  'buckhannon': 'upshur',
  'keyser': 'mineral'
}

// Map cities to their counties (Wisconsin)
const CITY_TO_COUNTY_WI = {
  'milwaukee': 'milwaukee',
  'madison': 'dane',
  'green bay': 'brown',
  'kenosha': 'kenosha',
  'racine': 'racine',
  'appleton': 'outagamie',
  'waukesha': 'waukesha',
  'eau claire': 'eau claire',
  'oshkosh': 'winnebago',
  'janesville': 'rock',
  'west allis': 'milwaukee',
  'la crosse': 'la crosse',
  'sheboygan': 'sheboygan',
  'wauwatosa': 'milwaukee',
  'fond du lac': 'fond du lac',
  'new berlin': 'waukesha',
  'wausau': 'marathon',
  'brookfield': 'waukesha',
  'greenfield': 'milwaukee',
  'beloit': 'rock',
  'franklin': 'milwaukee',
  'oak creek': 'milwaukee',
  'manitowoc': 'manitowoc',
  'west bend': 'washington',
  'sun prairie': 'dane',
  'superior': 'douglas',
  'fitchburg': 'dane',
  'stevens point': 'portage',
  'neenah': 'winnebago',
  'mequon': 'ozaukee',
  'south milwaukee': 'milwaukee',
  'pleasant prairie': 'kenosha',
  'menomonee falls': 'waukesha',
  'marshfield': 'wood',
  'watertown': 'jefferson',
  'menasha': 'winnebago',
  'muskego': 'waukesha',
  'de pere': 'brown',
  'cedarburg': 'ozaukee',
  'middleton': 'dane'
}

// Map cities to their counties (Wyoming)
const CITY_TO_COUNTY_WY = {
  'cheyenne': 'laramie',
  'casper': 'natrona',
  'laramie': 'albany',
  'gillette': 'campbell',
  'rock springs': 'sweetwater',
  'sheridan': 'sheridan',
  'green river': 'sweetwater',
  'evanston': 'uinta',
  'riverton': 'fremont',
  'jackson': 'teton',
  'cody': 'park',
  'rawlins': 'carbon',
  'lander': 'fremont',
  'torrington': 'goshen',
  'powell': 'park',
  'douglas': 'converse',
  'worland': 'washakie',
  'buffalo': 'johnson',
  'newcastle': 'weston',
  'afton': 'lincoln',
  'thermopolis': 'hot springs',
  'wheatland': 'platte',
  'pinedale': 'sublette'
}

// Map cities to their counties (Florida)
const CITY_TO_COUNTY_FL = {
  'tampa': 'hillsborough',
  'jacksonville': 'duval',
  'miami': 'miami-dade',
  'orlando': 'orange',
  'st petersburg': 'pinellas',
  'saint petersburg': 'pinellas',
  'st. petersburg': 'pinellas',
  'fort lauderdale': 'broward',
  'ft. lauderdale': 'broward',
  'boca raton': 'palm beach',
  'west palm beach': 'palm beach',
  'palm beach gardens': 'palm beach',
  'boynton beach': 'palm beach',
  'delray beach': 'palm beach',
  'jupiter': 'palm beach',
  'tequesta': 'palm beach',
  'north palm beach': 'palm beach',
  'clearwater': 'pinellas',
  'tarpon springs': 'pinellas',
  'safety harbor': 'pinellas',
  'palm harbor': 'pinellas',
  'oldsmar': 'pinellas',
  'fort myers': 'lee',
  'ft. myers': 'lee',
  'cape coral': 'lee',
  'tallahassee': 'leon',
  'pensacola': 'escambia',
  'gulf breeze': 'santa rosa',
  'sarasota': 'sarasota',
  'venice': 'sarasota',
  'north port': 'sarasota',
  'bradenton': 'manatee',
  'lakeland': 'polk',
  'winter haven': 'polk',
  'bartow': 'polk',
  'auburndale': 'polk',
  'davenport': 'polk',
  'gainesville': 'alachua',
  'ocala': 'marion',
  'daytona beach': 'volusia',
  'palm coast': 'flagler',
  'kissimmee': 'osceola',
  'winter garden': 'orange',
  'winter park': 'orange',
  'maitland': 'orange',
  'ocoee': 'orange',
  'oviedo': 'seminole',
  'altamonte springs': 'seminole',
  'lake mary': 'seminole',
  'sanford': 'seminole',
  'melbourne': 'brevard',
  'rockledge': 'brevard',
  'doral': 'miami-dade',
  'coral gables': 'miami-dade',
  'miami lakes': 'miami-dade',
  'north miami': 'miami-dade',
  'hallandale beach': 'broward',
  'hollywood': 'broward',
  'pompano beach': 'broward',
  'coral springs': 'broward',
  'plantation': 'broward',
  'sunrise': 'broward',
  'davie': 'broward',
  'weston': 'broward',
  'miramar': 'broward',
  'pembroke pines': 'broward',
  'dania': 'broward',
  'lauderdale lakes': 'broward',
  'margate': 'broward',
  'deerfield beach': 'broward',
  'cooper city': 'broward',
  'naples': 'collier',
  'immokalee': 'collier',
  'vero beach': 'indian river',
  'fort pierce': 'saint lucie',
  'port saint lucie': 'saint lucie',
  'stuart': 'martin',
  'palm city': 'martin',
  'port salerno': 'martin',
  'punta gorda': 'charlotte',
  'port charlotte': 'charlotte',
  'lake suzy': 'charlotte',
  'brandon': 'hillsborough',
  'temple terrace': 'hillsborough',
  'lutz': 'hillsborough',
  'wesley chapel': 'pasco',
  'land o\' lakes': 'pasco',
  'hudson': 'pasco',
  'holiday': 'pasco',
  'zephyrhills': 'pasco',
  'jacksonville beach': 'duval',
  'jacksonville bch': 'duval',
  'fernandina beach': 'nassau',
  'fleming island': 'clay',
  'saint augustine': 'saint johns',
  'ponte vedra beach': 'saint johns',
  'destin': 'okaloosa'
}

// Match main heatmap color scheme
const getColorForGrowth = (growth) => {
  if (growth <= -25) return am5.color(0x7F1D1D) // deep red
  if (growth <= -11) return am5.color(0xDC2626) // red
  if (growth < 0) return am5.color(0xFCA5A5)    // light red
  if (growth <= 10) return am5.color(0xBBF7D0)  // light green
  if (growth <= 25) return am5.color(0x22C55E)  // green
  return am5.color(0x14532D)                     // deep green
}

const getGrowthLabel = (growth) => {
  if (growth <= -25) return "Declining significantly"
  if (growth <= -11) return "Declining moderately"
  if (growth < 0) return "Declining slightly"
  if (growth <= 10) return "Growing moderately"
  if (growth <= 25) return "Growing strongly"
  return "Growing significantly"
}

const ProtectedCountyMap = ({ firms, userState }) => {
  const chartDiv = useRef(null)
  const chartRoot = useRef(null)
  const polygonSeries = useRef(null)
  
  const [filters, setFilters] = useState({
    timeframe: '1Y Growth',
    size: 'all'
  })

  const filterRecords = (records) => {
    
    let filtered = records.filter(r => r.hqStateAbbr)
    
    // Filter by user's state (handle both abbreviation and full name)
    if (userState) {
      // Convert full state name to abbreviation if needed (lowercase from map)
      const stateLower = STATE_NAME_TO_ABBR[userState] || userState.toLowerCase()
      // Convert to uppercase for comparison with data
      const stateAbbr = stateLower.toUpperCase()
      
      
      filtered = filtered.filter(r => {
        const match = r.hqStateAbbr === stateAbbr
        return match
      })
      
      if (filtered.length > 0) {
      }
    }
    
    if (filters.size !== 'all') {
      filtered = filtered.filter(r => {
        const count = Number(r.eeCount) || 0
        if (filters.size === 'small') return count < 50
        if (filters.size === 'medium') return count >= 50 && count <= 500
        if (filters.size === 'large') return count > 500
        return true
      })
    }
    
    return filtered
  }

  const aggregateByCity = (records) => {
    
    const cityData = {}
    
    records.forEach(r => {
      const city = r.companyCity
      if (!city) return
      
      if (!cityData[city]) {
        cityData[city] = {
          firms: [],
          headcount: 0,
          tenures: [],
          growths: []
        }
      }
      
      cityData[city].firms.push(r)
      cityData[city].headcount += Number(r.eeCount) || 0
      
      const tenure = Number(r.averageTenure) || 0
      if (tenure > 0) cityData[city].tenures.push(tenure)
      
      // Get growth based on selected timeframe
      let growthValue = '0%'
      if (filters.timeframe === '1Y Growth') {
        growthValue = r.growth1Y || '0%'
      } else if (filters.timeframe === '6M Growth') {
        growthValue = r.growth6M || '0%'
      } else if (filters.timeframe === '2Y Growth') {
        growthValue = r.growth2Y || '0%'
      }
      
      const growthStr = String(growthValue).replace("%", "").trim()
      const growth = parseFloat(growthStr)
      
      if (!isNaN(growth)) {
        cityData[city].growths.push(growth)
      }
    })
    
    const aggregated = Object.entries(cityData).map(([city, data]) => {
      const avgGrowth = data.growths.length > 0 
        ? data.growths.reduce((a, b) => a + b, 0) / data.growths.length 
        : 0
      
      const medianTenure = data.tenures.length > 0
        ? data.tenures.sort((a, b) => a - b)[Math.floor(data.tenures.length / 2)]
        : 0
      
      
      return {
        city: city,
        growth: avgGrowth,
        firmCount: data.firms.length,
        totalHeadcount: data.headcount,
        medianTenure: medianTenure
      }
    })
    
    return aggregated
  }

  useEffect(() => {
    
    if (!chartDiv.current) {
      return
    }


    // Initialize chart
    const root = am5.Root.new(chartDiv.current)
    root.setThemes([am5themes_Animated.new(root)])
    
    const chart = root.container.children.push(
      am5map.MapChart.new(root, {
        panX: "translateX",
        panY: "translateY",
        projection: am5map.geoAlbersUsa(),
        wheelY: "none", // Disable mouse wheel zoom
        maxZoomLevel: 4, // Limit maximum zoom level
        minZoomLevel: 1  // Set minimum zoom level
      })
    )

    // Add zoom control buttons
    const zoomControl = chart.set("zoomControl", am5map.ZoomControl.new(root, {
      zoomStep: 0.5 // Smaller zoom increments (default is 2)
    }))
    zoomControl.homeButton.set("visible", false) // Hide home button, keep only +/-


    // Load state county map
    const loadCountyMap = () => {
      try {
        // Convert state name to lowercase code
        const stateCode = STATE_NAME_TO_ABBR[userState] || userState.toLowerCase()
        
        // Get geodata from static imports
        const geodata = COUNTY_GEODATA_MAP[stateCode]
        
        if (!geodata) {
          console.error(`❌ No county geodata available for state: ${stateCode}`)
          return
        }
        
        
        // Create polygon series with county data
        const series = chart.series.push(
          am5map.MapPolygonSeries.new(root, {
            geoJSON: geodata
          })
        )
        

        series.mapPolygons.template.setAll({
          tooltipText: "{name}",
          interactive: true,
          strokeWidth: 0.5,
          stroke: am5.color(0xffffff),
          showTooltipOn: "click"
        })


        series.mapPolygons.template.states.create("hover", {
          fill: am5.color(0x4FE3D9)
        })

        series.mapPolygons.template.adapters.add("fill", (fill, target) => {
          const dataItem = target.dataItem
          if (dataItem && dataItem.dataContext.growth !== undefined) {
            const growth = dataItem.dataContext.growth || 0
            return getColorForGrowth(growth)
          }
          return am5.color(0x1f2950)
        })

        series.mapPolygons.template.adapters.add("tooltipHTML", (text, target) => {
          const dataItem = target.dataItem
          if (dataItem && dataItem.dataContext) {
            const d = dataItem.dataContext
            const countyName = d.name || 'Unknown'
            const growth = d.growth || 0
            const firmCount = d.firmCount || 0
            const totalHeadcount = d.totalHeadcount || 0
            const medianTenure = d.medianTenure || 0
            const cities = d.cities || []
            
            if (firmCount === 0) {
              return `<div style="background: white; padding: 12px 16px; border-radius: 6px; box-shadow: 0 2px 8px rgba(0,0,0,0.15); font-family: -apple-system, sans-serif;">
                <div style="font-size: 14px; color: #495057;">${countyName}: No data</div>
              </div>`
            }
            
            // Build cities list HTML
            let citiesHTML = ''
            if (cities.length > 0) {
              citiesHTML = '<div style="font-size: 12px; margin-top: 8px; padding-top: 8px; border-top: 1px solid #dee2e6;">'
              citiesHTML += '<div style="font-weight: 600; margin-bottom: 4px; color: #212529;">Cities:</div>'
              cities.forEach(city => {
                citiesHTML += `<div style="color: #495057; margin-bottom: 2px;">• ${city.name}: ${city.firmCount} firms, ${city.growth > 0 ? '+' : ''}${city.growth.toFixed(1)}% growth</div>`
              })
              citiesHTML += '</div>'
            }
            
            return `
              <div style="background: white; padding: 12px 16px; border-radius: 6px; box-shadow: 0 2px 8px rgba(0,0,0,0.15); font-family: -apple-system, sans-serif; min-width: 280px; max-width: 400px;">
                <div style="font-size: 16px; font-weight: 700; margin-bottom: 8px; color: #212529;">
                  ${countyName} – ${getGrowthLabel(growth)}
                </div>
                <div style="font-size: 14px; margin-bottom: 4px; color: #495057;">
                  <strong>Headcount growth:</strong> ${growth > 0 ? '+' : ''}${growth.toFixed(1)}% (last 12 months)
                </div>
                <div style="font-size: 14px; margin-bottom: 4px; color: #495057;">
                  <strong>Firms in county:</strong> ${firmCount.toLocaleString()}
                </div>
                <div style="font-size: 14px; margin-bottom: 4px; color: #495057;">
                  <strong>Total headcount (est.):</strong> ${totalHeadcount.toLocaleString()}
                </div>
                <div style="font-size: 14px; margin-bottom: 4px; color: #495057;">
                  <strong>Median leader tenure:</strong> ${medianTenure.toFixed(1)} years
                </div>
                ${citiesHTML}
              </div>
            `
          }
          return text
        })

        // Wait for series to finish loading
        series.events.once("datavalidated", () => {
          polygonSeries.current = series
        })
        
      } catch (error) {
        console.error('❌ Error loading county map:', error)
      }
    }

    loadCountyMap()
    chartRoot.current = root

    return () => {
      root.dispose()
    }
  }, [userState])

  useEffect(() => {
    
    if (!polygonSeries.current) {
      return
    }


    const filtered = filterRecords(firms)
    
    const cityAggregates = aggregateByCity(filtered)
    
    // Match cities to counties and update polygon data
    if (polygonSeries.current) {
      const polygons = polygonSeries.current.mapPolygons.values
      
      // Determine which city-to-county mapping to use based on user's state
      const stateCode = STATE_NAME_TO_ABBR[userState] || userState.toLowerCase()
      const cityToCountyMaps = {
        'al': CITY_TO_COUNTY_AL,
        'ak': CITY_TO_COUNTY_AK,
        'az': CITY_TO_COUNTY_AZ,
        'ar': CITY_TO_COUNTY_AR,
        'ca': CITY_TO_COUNTY_CA,
        'co': CITY_TO_COUNTY_CO,
        'ct': CITY_TO_COUNTY_CT,
        'de': CITY_TO_COUNTY_DE,
        'fl': CITY_TO_COUNTY_FL,
        'ga': CITY_TO_COUNTY_GA,
        'hi': CITY_TO_COUNTY_HI,
        'id': CITY_TO_COUNTY_ID,
        'il': CITY_TO_COUNTY_IL,
        'in': CITY_TO_COUNTY_IN,
        'ia': CITY_TO_COUNTY_IA,
        'ks': CITY_TO_COUNTY_KS,
        'ky': CITY_TO_COUNTY_KY,
        'la': CITY_TO_COUNTY_LA,
        'me': CITY_TO_COUNTY_ME,
        'md': CITY_TO_COUNTY_MD,
        'ma': CITY_TO_COUNTY_MA,
        'mi': CITY_TO_COUNTY_MI,
        'mn': CITY_TO_COUNTY_MN,
        'ms': CITY_TO_COUNTY_MS,
        'mo': CITY_TO_COUNTY_MO,
        'mt': CITY_TO_COUNTY_MT,
        'ne': CITY_TO_COUNTY_NE,
        'nv': CITY_TO_COUNTY_NV,
        'nh': CITY_TO_COUNTY_NH,
        'nj': CITY_TO_COUNTY_NJ,
        'nm': CITY_TO_COUNTY_NM,
        'ny': CITY_TO_COUNTY_NY,
        'nc': CITY_TO_COUNTY_NC,
        'nd': CITY_TO_COUNTY_ND,
        'oh': CITY_TO_COUNTY_OH,
        'ok': CITY_TO_COUNTY_OK,
        'or': CITY_TO_COUNTY_OR,
        'pa': CITY_TO_COUNTY_PA,
        'ri': CITY_TO_COUNTY_RI,
        'sc': CITY_TO_COUNTY_SC,
        'sd': CITY_TO_COUNTY_SD,
        'tn': CITY_TO_COUNTY_TN,
        'tx': CITY_TO_COUNTY_TX,
        'ut': CITY_TO_COUNTY_UT,
        'vt': CITY_TO_COUNTY_VT,
        'va': CITY_TO_COUNTY_VA,
        'wa': CITY_TO_COUNTY_WA,
        'wv': CITY_TO_COUNTY_WV,
        'wi': CITY_TO_COUNTY_WI,
        'wy': CITY_TO_COUNTY_WY
      }
      
      const cityToCountyMap = cityToCountyMaps[stateCode] || {}
      
      // Aggregate cities by county
      const countyData = {}
      cityAggregates.forEach(city => {
        const cityName = city.city.toLowerCase().trim()
        const countyName = cityToCountyMap[cityName]
        
        if (countyName) {
          if (!countyData[countyName]) {
            countyData[countyName] = {
              cities: [],
              totalHeadcount: 0,
              growths: [],
              tenures: []
            }
          }
          
          countyData[countyName].cities.push({
            name: city.city,
            firmCount: city.firmCount,
            growth: city.growth,
            headcount: city.totalHeadcount
          })
          countyData[countyName].totalHeadcount += city.totalHeadcount
          countyData[countyName].growths.push(city.growth)
          countyData[countyName].tenures.push(city.medianTenure)
        }
      })
      
      
      let matchedCount = 0
      let unmatchedCounties = []
      
      polygons.forEach(polygon => {
        if (polygon.dataItem?.dataContext) {
          const countyName = polygon.dataItem.dataContext.name || ''
          const cleanName = countyName.replace(/\s+County$/i, '').toLowerCase().trim()
          
          const data = countyData[cleanName]
          
          if (data && data.growths.length > 0) {
            const avgGrowth = data.growths.reduce((a, b) => a + b, 0) / data.growths.length
            const avgTenure = data.tenures.reduce((a, b) => a + b, 0) / data.tenures.length
            const totalFirms = data.cities.reduce((sum, city) => sum + city.firmCount, 0)
            
            
            polygon.dataItem.dataContext = {
              ...polygon.dataItem.dataContext,
              growth: avgGrowth,
              firmCount: totalFirms,
              totalHeadcount: data.totalHeadcount,
              medianTenure: avgTenure,
              cities: data.cities
            }
            
            // Force the polygon to update its fill color
            const fillColor = getColorForGrowth(avgGrowth)
            polygon.set("fill", fillColor)
            
            matchedCount++
          } else {
            unmatchedCounties.push(cleanName)
            // Set default color for counties with no data
            polygon.set("fill", am5.color(0x1f2950))
          }
        }
      })
      
    }
  }, [firms, filters, userState])

  return (
    <>
      <div className="heatmap-filters">
        <div className="filter-group">
          <label className="filter-label">Timeframe:</label>
          <select 
            className="filter-select"
            value={filters.timeframe}
            onChange={(e) => setFilters({...filters, timeframe: e.target.value})}
          >
            <option value="2Y Growth">Last 24 months</option>
            <option value="1Y Growth">Last 12 months</option>
            <option value="6M Growth">Last 6 months</option>
          </select>
        </div>
        
        <div className="filter-group">
          <label className="filter-label">Size:</label>
          <select 
            className="filter-select"
            value={filters.size}
            onChange={(e) => setFilters({...filters, size: e.target.value})}
          >
            <option value="all">All sizes</option>
            <option value="small">Small (&lt; 50)</option>
            <option value="medium">Medium (50-500)</option>
            <option value="large">Large (&gt; 500)</option>
          </select>
        </div>
      </div>

      <div ref={chartDiv} className="heatmap-chart"></div>
    </>
  )
};

export default ProtectedCountyMap;

from __future__ import annotations

from dataclasses import dataclass, field
from urllib.parse import urlparse


@dataclass(frozen=True)
class SourceConfig:
    slug: str
    name: str
    seeds: tuple[str, ...]
    listing_hints: tuple[str, ...] = ()
    follow_hints: tuple[str, ...] = ()
    exclude_hints: tuple[str, ...] = ()
    max_pages: int = 250
    max_depth: int = 3
    delay_seconds: float = 0.75
    allowed_domains: tuple[str, ...] = field(default_factory=tuple)

    def domains(self) -> set[str]:
        domains = {urlparse(seed).netloc.lower().lstrip("www.") for seed in self.seeds}
        domains.update(domain.lower().lstrip("www.") for domain in self.allowed_domains)
        return domains


TOP_US_CLASSPASS_MARKETS = (
    "new-york-metro",
    "los-angeles",
    "chicago",
    "dallas",
    "houston",
    "washington-dc",
    "philadelphia",
    "atlanta",
    "miami",
    "phoenix",
    "boston",
    "san-francisco",
    "riverside",
    "detroit",
    "seattle",
    "minneapolis",
    "san-diego",
    "tampa",
    "denver",
    "baltimore",
    "st-louis",
    "charlotte",
    "orlando",
    "san-antonio",
    "portland",
    "sacramento",
    "pittsburgh",
    "austin",
    "las-vegas",
    "cincinnati",
)


CLASSPASS_WELLNESS_CATEGORIES = ("cryotherapy", "sports-recovery")


REALSELF_CITIES = (
    ("Georgia", "Atlanta"),
    ("Texas", "Austin"),
    ("Massachusetts", "Boston"),
    ("North-Carolina", "Charlotte"),
    ("Illinois", "Chicago"),
    ("Texas", "Dallas"),
    ("Colorado", "Denver"),
    ("Michigan", "Detroit"),
    ("Texas", "Houston"),
    ("California", "Los-Angeles"),
    ("Florida", "Miami"),
    ("New-York", "New-York"),
    ("Florida", "Orlando"),
    ("Pennsylvania", "Philadelphia"),
    ("Arizona", "Phoenix"),
    ("Texas", "San-Antonio"),
    ("California", "San-Diego"),
    ("California", "San-Francisco"),
    ("Washington", "Seattle"),
)


REALSELF_PROVIDER_TYPES = (
    "Plastic-Surgeon",
    "Board-Eligible-Plastic-Surgeon",
    "Facial-Plastic-Surgeon",
    "Dermatologist",
    "Dermatologic-Surgeon",
    "Oculoplastic-Surgeon",
    "Hair-Restoration-Surgeon",
)


SOURCES = {
    "spannr": SourceConfig(
        slug="spannr",
        name="Spannr",
        seeds=("https://spannr.com/marketplace",),
        listing_hints=("/marketplace/clinic/", "/marketplace/retreat/"),
        follow_hints=("/marketplace", "/marketplace/clinic/", "/marketplace/retreat/"),
        exclude_hints=("/blog", "/about", "/privacy", "/terms", "/login", "/sign"),
        max_pages=350,
        max_depth=4,
    ),
    "longevity_technology_clinics": SourceConfig(
        slug="longevity_technology_clinics",
        name="Longevity Technology Clinics",
        seeds=("https://longevity.technology/clinics",),
        listing_hints=("/clinics/longevity-clinics/", "/clinics/contact?clinic_name="),
        follow_hints=("/clinics/longevity-clinics/", "/clinics/contact?clinic_name="),
        exclude_hints=(
            "/news",
            "/advertise",
            "/privacy",
            "/terms",
            "/login",
            "/tag/",
            "/category/",
            "/courses",
            "/course",
            "/join",
            "/about",
            "/blog",
            "/search",
            "/register",
            "/clinic-client",
            "/corporate",
            "/membership",
            "/private",
            "/vendor",
        ),
        max_pages=350,
        max_depth=4,
    ),
    "biohacking_map": SourceConfig(
        slug="biohacking_map",
        name="The Biohacking Map",
        seeds=("https://thebiohackingmap.com/directory/", "https://thebiohackingmap.com/api/clinics"),
        listing_hints=("/directory/", "/clinic/", "/listing/", "/place/"),
        follow_hints=("/directory", "/clinic", "/listing", "/place", "/location", "/category"),
        exclude_hints=("/blog", "/privacy", "/terms", "/login", "/account"),
        max_pages=500,
        max_depth=4,
    ),
    "world_longevity_clinics": SourceConfig(
        slug="world_longevity_clinics",
        name="World Longevity Clinics",
        seeds=("https://worldlongevityclinics.com/",),
        listing_hints=("/clinic", "/clinics", "/listing", "/directory", "/locations"),
        follow_hints=("/clinic", "/clinics", "/listing", "/directory", "/locations"),
        exclude_hints=("/blog", "/privacy", "/terms", "/login", "/cart", "/checkout", "/compare", "-vs-", "-alternatives"),
        max_pages=350,
        max_depth=4,
    ),
    "immortality_clinic": SourceConfig(
        slug="immortality_clinic",
        name="Immortality Clinic",
        seeds=("https://immortalityclinic.com/",),
        listing_hints=("/clinic", "/clinics", "/longevity", "/services", "/treatments"),
        follow_hints=("/clinic", "/clinics", "/longevity", "/services", "/treatments", "/locations"),
        exclude_hints=("/blog", "/privacy", "/terms", "/login", "/cart", "/checkout"),
        max_pages=250,
        max_depth=3,
    ),
    "longevity_lion": SourceConfig(
        slug="longevity_lion",
        name="Longevity Lion",
        seeds=("https://longevitylion.com/",),
        listing_hints=("/clinic", "/clinics", "/directory", "/listing", "/places"),
        follow_hints=("/clinic", "/clinics", "/directory", "/listing", "/places", "/location"),
        exclude_hints=("/blog", "/privacy", "/terms", "/login", "/sign"),
        max_pages=350,
        max_depth=4,
    ),
    "bookimed_longevity": SourceConfig(
        slug="bookimed_longevity",
        name="Bookimed Longevity Health",
        seeds=tuple(
            ["https://us-uk.bookimed.com/clinics/direction=longevity-health/best/"]
            + [
                f"https://us-uk.bookimed.com/clinics/direction=longevity-health/best/page={page}/"
                for page in range(2, 27)
            ]
        ),
        listing_hints=("/clinic/", "/clinics/", "/doctors/"),
        follow_hints=("/clinic/",),
        exclude_hints=(
            "/blog",
            "/privacy",
            "/terms",
            "/login",
            "/sign",
            "/about",
            "/doctors",
            "/clinics/country",
            "/clinics/procedure",
            "/clinics/illness",
            "/page/",
        ),
        max_pages=500,
        max_depth=4,
        delay_seconds=0.2,
        allowed_domains=("bookimed.com", "us-uk.bookimed.com"),
    ),
    "exec_health": SourceConfig(
        slug="exec_health",
        name="Executive Health",
        seeds=("https://www.exechealth.org",),
        listing_hints=("/directory", "/provider", "/clinic", "/clinics", "/locations", "/program"),
        follow_hints=("/provider", "/clinic", "/clinics", "/locations", "/program", "/directory"),
        exclude_hints=("/blog", "/privacy", "/terms", "/login", "/cart", "/checkout"),
        max_pages=250,
        max_depth=3,
    ),
    "human_longevity": SourceConfig(
        slug="human_longevity",
        name="Human Longevity",
        seeds=("https://www.humanlongevity.com/",),
        listing_hints=("/location", "/locations", "/program", "/services", "/health-nucleus"),
        follow_hints=("/location", "/locations", "/program", "/services", "/health-nucleus", "/contact"),
        exclude_hints=("/blog", "/privacy", "/terms", "/login", "/cart", "/checkout"),
        max_pages=250,
        max_depth=3,
    ),
    "classpass_wellness": SourceConfig(
        slug="classpass_wellness",
        name="ClassPass Wellness Recovery Search",
        seeds=tuple(
            f"https://classpass.com/search/{market}/{category}?radius=25"
            for market in TOP_US_CLASSPASS_MARKETS
            for category in CLASSPASS_WELLNESS_CATEGORIES
        ),
        listing_hints=("/search/",),
        follow_hints=(),
        exclude_hints=(),
        max_pages=len(TOP_US_CLASSPASS_MARKETS) * len(CLASSPASS_WELLNESS_CATEGORIES),
        max_depth=0,
        delay_seconds=0.2,
        allowed_domains=("classpass.com",),
    ),
    "zocdoc_specialists": SourceConfig(
        slug="zocdoc_specialists",
        name="Zocdoc Specialist Directories",
        seeds=(
            "https://www.zocdoc.com/sports-medicine-specialists",
            "https://www.zocdoc.com/radiologists",
            "https://www.zocdoc.com/sleep-medicine-specialists",
            "https://www.zocdoc.com/plastic-surgeons",
        ),
        listing_hints=(
            "/sports-medicine-specialists",
            "/radiologists",
            "/sleep-medicine-specialists",
            "/plastic-surgeons",
        ),
        follow_hints=(),
        exclude_hints=(),
        max_pages=4,
        max_depth=0,
        delay_seconds=0.2,
        allowed_domains=("zocdoc.com",),
    ),
    "realself_providers": SourceConfig(
        slug="realself_providers",
        name="RealSelf Provider Directory",
        seeds=tuple(
            f"https://www.realself.com/find/{state}/{city}/{provider_type}"
            for state, city in REALSELF_CITIES
            for provider_type in REALSELF_PROVIDER_TYPES
        ),
        listing_hints=("/find/", "/dr/"),
        follow_hints=("/dr/",),
        exclude_hints=("/reviews", "/questions", "/photos", "/forum", "/news"),
        max_pages=1200,
        max_depth=1,
        delay_seconds=1.5,
        allowed_domains=("realself.com",),
    ),
    "a4m_find_doctor": SourceConfig(
        slug="a4m_find_doctor",
        name="A4M Find a Doctor",
        seeds=(
            "https://www.a4m.com/find-a-doctor.html",
            "https://www.a4m.com/robots.txt",
            "https://www.a4m.com/sitemap.xml",
            "https://www.a4m.com/simar-randhawa-wellnessmd-new-york-ny-2.html",
            "https://www.a4m.com/yekaterina-kuznetsova-functional-medicine-nyc-new-york-city-ny.html",
            "https://www.a4m.com/dr-andrew-kibert-doctor-k-private-medicine-pllc-new-york-ny.html",
        ),
        listing_hints=("/find-a-doctor",),
        follow_hints=(),
        exclude_hints=(),
        max_pages=6,
        max_depth=0,
        delay_seconds=0.2,
    ),
    "longevitydocs_directory": SourceConfig(
        slug="longevitydocs_directory",
        name="LongevityDocs Physician Directory",
        seeds=("https://longevitydocs.org/pages/welcome-directory",),
        listing_hints=("/pages/welcome-directory",),
        follow_hints=(),
        exclude_hints=("/cart", "/account", "/customer_authentication", "/search"),
        max_pages=1,
        max_depth=0,
        delay_seconds=0.2,
    ),
    "bioedge_clinics": SourceConfig(
        slug="bioedge_clinics",
        name="bioEDGE Longevity Clinics",
        seeds=tuple(
            ["https://bioedgelongevity.com/clinics"]
            + [f"https://bioedgelongevity.com/clinics?page={page}" for page in range(2, 100)]
        ),
        listing_hints=("/clinics/",),
        follow_hints=("/clinics",),
        exclude_hints=("/articles", "/news", "/library", "/what-is", "/leaders", "/solutions"),
        max_pages=5000,
        max_depth=4,
        delay_seconds=0.05,
    ),
    "concierge_doctors_near_me": SourceConfig(
        slug="concierge_doctors_near_me",
        name="Concierge Doctors Near Me",
        seeds=tuple(
            ["https://conciergedoctorsnearme.com/listings/"]
            + [f"https://conciergedoctorsnearme.com/listings/page/{page}/" for page in range(2, 99)]
        ),
        listing_hints=("/listing/", "/listings/"),
        follow_hints=("/listing/", "/listings/"),
        exclude_hints=(
            "/blog",
            "/privacy",
            "/terms",
            "/wp-login",
            "/cart",
            "/checkout",
            "/region/",
            "/listing-category/",
            "/add-your-practice",
            "/bookmarks",
            "/reviews",
        ),
        max_pages=1500,
        max_depth=2,
        delay_seconds=0.05,
    ),
    "best_executive_physical_programs": SourceConfig(
        slug="best_executive_physical_programs",
        name="Best Executive Physical Programs",
        seeds=("https://bestexecutivephysicalprograms.com/",),
        listing_hints=("/",),
        follow_hints=(),
        exclude_hints=(),
        max_pages=1,
        max_depth=0,
        delay_seconds=0.2,
    ),
    "bookimed_longevity_doctors": SourceConfig(
        slug="bookimed_longevity_doctors",
        name="Bookimed Longevity Health Doctors",
        seeds=tuple(
            ["https://us-uk.bookimed.com/doctors/direction=longevity-health/"]
            + [
                f"https://us-uk.bookimed.com/doctors/direction=longevity-health/page={page}/"
                for page in range(2, 7)
            ]
        ),
        listing_hints=("/doctor/", "/doctors/direction=longevity-health"),
        follow_hints=("/doctor/", "/doctors/direction=longevity-health"),
        exclude_hints=(
            "/blog",
            "/privacy",
            "/terms",
            "/login",
            "/sign",
            "/clinic/",
            "/clinics/",
            "/doctors/country",
            "/doctors/procedure",
            "/doctors/illness",
        ),
        max_pages=150,
        max_depth=2,
        delay_seconds=0.15,
        allowed_domains=("bookimed.com", "us-uk.bookimed.com"),
    ),
    "stem_cell_authority": SourceConfig(
        slug="stem_cell_authority",
        name="Stem Cell Authority Business Directory",
        seeds=tuple(
            ["https://stemcellauthority.com/business-directory/?wpbdp_view=all_listings"]
            + [
                f"https://stemcellauthority.com/business-directory/page/{page}/?wpbdp_view=all_listings"
                for page in range(2, 801)
            ]
        ),
        listing_hints=("/business-directory/",),
        follow_hints=("/business-directory/",),
        exclude_hints=(
            "/blogs",
            "/business-directory/location/",
            "/business-directory/wpbdp_tag/",
            "/business-directory/?dosrch=",
            "/business-directory/?wpbdp_view=search",
            "/business-directory/?wpbdp_view=submit_listing",
        ),
        max_pages=900,
        max_depth=3,
        delay_seconds=0.05,
    ),
    "mayo_executive_health_locations": SourceConfig(
        slug="mayo_executive_health_locations",
        name="Mayo Clinic Executive Health Locations",
        seeds=("https://www.mayoclinic.org/executive-health/locations",),
        listing_hints=("/executive-health/locations",),
        follow_hints=("/executive-health/locations",),
        exclude_hints=("/appointments", "/about-mayo-clinic", "/diseases-conditions", "/tests-procedures"),
        max_pages=10,
        max_depth=2,
        delay_seconds=0.2,
    ),
    "fountain_life_best_longevity_clinics_blog": SourceConfig(
        slug="fountain_life_best_longevity_clinics_blog",
        name="Fountain Life Best Longevity Clinics Blog",
        seeds=("https://www.fountainlife.com/blog/best-longevity-clinics-in-the-world/",),
        listing_hints=("/blog/best-longevity-clinics-in-the-world",),
        follow_hints=(),
        exclude_hints=(),
        max_pages=1,
        max_depth=0,
        delay_seconds=0.2,
    ),
}

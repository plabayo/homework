// Copyright (C) 2024-2026 Plabayo
// See LICENSE in the repository root for details.
// Source-available; non-commercial use only.

use rama::http::Request;
use rama::http::protocols::html::{IntoHtml, a, code, footer, h2, li, p, section, small, ul};
use rama::http::service::web::response::IntoResponse;

use crate::service::language_banner::lang_banner;
use crate::service::layout::{PageInlines, PageMeta, page, page_header};

pub async fn privacy(req: Request) -> impl IntoResponse {
    let banner = lang_banner(req.headers());

    page(
        PageMeta {
            title: "Privacyverklaring — Oefeningen Basisschool",
            description: "Geen account, geen tracking, geen analytics, geen cookies. \
                          Alle oefendata blijft op het toestel van het kind.",
            og_path: "/privacy".into(),
            favicon_emoji: "🔒",
        },
        PageInlines::default(),
        page_body(),
        banner,
    )
}

fn page_body() -> impl IntoHtml {
    (
        page_header("Privacyverklaring"),
        section!(
            class = "page-intro",
            p!(
                "Korte versie: er bestaat geen account, er bestaan geen cookies, ",
                "er wordt niets aan derden doorgegeven. Alle oefendata leeft op het toestel ",
                "van het kind. De server bewaart zelf niets.",
            ),
        ),
        section_what_we_dont_collect(),
        section_what_stays_on_device(),
        section_what_the_server_sees(),
        section_changes_and_contact(),
        site_footer(),
    )
}

fn section_what_we_dont_collect() -> impl IntoHtml {
    section!(
        class = "about-section",
        h2!("Wat we niet verzamelen"),
        ul!(
            li!("Geen account, geen registratie, geen inloggen."),
            li!("Geen cookies — geen enkele, ook geen 'noodzakelijke'."),
            li!(
                "Geen analytics — geen Google Analytics, geen pixels, geen telemetrie ",
                "naar derden."
            ),
            li!(
                "Geen database. De server houdt geen gebruikersrecords bij; er is ",
                "niets om te lekken."
            ),
            li!("Geen reclame, geen trackers, geen advertentienetwerken."),
            li!(
                "Geen persoonlijke gegevens. We vragen geen naam, geen leeftijd, ",
                "geen e-mailadres."
            ),
        ),
    )
}

fn section_what_stays_on_device() -> impl IntoHtml {
    section!(
        class = "about-section",
        h2!("Wat op het toestel blijft"),
        p!(
            "De app gebruikt twee opslagmechanismen van de browser zelf — beide ",
            "blijven volledig op het toestel en worden nooit naar de server gestuurd:"
        ),
        ul!(
            li!(
                code!("IndexedDB"),
                " — de oefengeschiedenis (welke vragen, welk antwoord, hoe lang), ",
                "de eigen flitskaartjesdecks, en de instellingen (donker thema, taalkeuze). ",
                "Wis je deze opslag in de browser, dan is alles weg."
            ),
            li!(
                code!("Cache Storage"),
                " (via de service worker) — de eigenlijke bestanden van de app ",
                "(HTML, CSS, JavaScript, pictogrammen) zodat alles offline blijft werken ",
                "zodra je de app één keer geopend hebt."
            ),
        ),
        p!(
            "Beide soorten opslag zijn zichtbaar (en verwijderbaar) via de ",
            "browserinstellingen, onder \"site-gegevens\" of \"opslag\"."
        ),
    )
}

fn section_what_the_server_sees() -> impl IntoHtml {
    section!(
        class = "about-section",
        h2!("Wat de server wél ziet"),
        p!(
            "Elke HTTP-aanvraag passeert de server. Per aanvraag bestaan de volgende ",
            "gegevens kortstondig:"
        ),
        ul!(
            li!("IP-adres (op TCP-niveau, nodig om het antwoord terug te sturen)."),
            li!("User-Agent (welke browser/versie)."),
            li!("Het opgevraagde pad, de HTTP-methode, en de statuscode van het antwoord."),
        ),
        p!(
            "Deze gegevens worden enkel gebruikt om de aanvraag te beantwoorden ",
            "en om misbruik (rate-limiting) te beperken. Plabayo houdt er zelf ",
            "geen logbestanden van bij — geen kopie in een eigen systeem, geen ",
            "geanalyseerde aggregaten, niets."
        ),
        p!(
            "Onze hostingprovider ",
            a!(href = "https://fly.io", "Fly.io"),
            " bewaart applicatielogs gedurende 7 dagen in hun Grafana-log-search ",
            "(zie ",
            a!(
                href = "https://fly.io/docs/monitoring/logging-overview/",
                "Fly.io's logging-documentatie",
            ),
            "). Na die 7 dagen worden ze automatisch verwijderd; we exporteren ze ",
            "niet en gebruiken ze niet voor profilering of advertenties — uitsluitend ",
            "voor operationeel debuggen wanneer er iets misgaat."
        ),
    )
}

fn section_changes_and_contact() -> impl IntoHtml {
    section!(
        class = "about-section",
        h2!("Wijzigingen en contact"),
        p!(
            "Als dit beleid wijzigt, passen we deze pagina aan. Er is geen ",
            "mailinglijst om je op de hoogte te brengen — die zou immers ",
            "e-mailadressen vereisen, die we niet verzamelen."
        ),
        p!(
            "Vragen over dit beleid? Stuur een mail naar ",
            a!(href = "mailto:hello@plabayo.tech", "hello@plabayo.tech ✉️"),
            "."
        ),
    )
}

fn site_footer() -> impl IntoHtml {
    footer!(
        class = "site-footer",
        p!(small!(
            "© 2024–2026 ",
            a!(href = "https://plabayo.tech", "Plabayo"),
            " · ",
            a!(href = "/", "Startpagina"),
            " · ",
            a!(href = "/about", "Over ons"),
        )),
    )
}

// Copyright (C) 2024-2026 Plabayo
// See LICENSE in the repository root for details.
// Source-available; non-commercial use only.

use rama::http::Request;
use rama::http::html::{IntoHtml, a, footer, h2, li, ol, p, section, small, ul};
use rama::http::service::web::response::IntoResponse;

use crate::service::language_banner::lang_banner;
use crate::service::layout::{PageMeta, page, page_header};

pub async fn about(req: Request) -> impl IntoResponse {
    let banner = lang_banner(req.headers());

    page(
        PageMeta {
            title: "Over ons — Oefeningen Basisschool",
            description: "Over het project: onze missie, didactische aanpak en hoe je de app gebruikt.",
            og_path: "/about".into(),
            favicon_emoji: "🏫",
        },
        None,
        page_body(),
        None,
        None,
        banner,
    )
}

fn page_body() -> impl IntoHtml {
    (
        page_header("Over ons"),
        section!(
            class = "page-intro",
            p!(
                "Een gratis oefenomgeving voor kinderen in het basisonderwijs. \
                 Gemaakt door ouders, voor ouders."
            ),
        ),
        section_missie(),
        section_didactiek(),
        section_gebruik(),
        section_plabayo(),
        section_bijdragen(),
        site_footer(),
    )
}

fn section_missie() -> impl IntoHtml {
    section!(
        class = "about-section",
        h2!("Onze missie"),
        p!(
            "Homework is een hulpmiddel voor thuis — geen vervanger voor de leerkracht. \
             Kinderen oefenen samen met een ouder of verzorger, op hun eigen tempo, \
             met oefeningen die aansluiten bij het Vlaamse basisonderwijs."
        ),
        p!(
            "Er is geen account nodig, geen reclame en geen betaalmuur. \
             De app werkt volledig offline zodra hij één keer geladen is. \
             Alle oefengeschiedenis blijft op het toestel van het kind zelf — \
             de server slaat niets op."
        ),
    )
}

fn section_didactiek() -> impl IntoHtml {
    section!(
        class = "about-section",
        h2!("Onze didactische aanpak"),
        p!(
            "We geloven dat herhaling en rust de basis zijn van goed leren. \
             Daarom:"
        ),
        ul!(
            li!(
                "Geen gamification, geen punten, geen streak-tellers. \
                 Fouten zijn gewoon feedback — een pandaatje dat zegt ",
                small!("\"probeer het nog eens\""),
                "."
            ),
            li!("De ouder zit naast het kind, net zoals bij pen en papier. \
                 Het scherm is een hulpmiddel, niet een opvoeder."),
            li!("Na elke oefenronde zie je welke vragen moeilijk waren. \
                 Met één klik oefen je precies die vragen opnieuw."),
            li!(
                "Privacy by design: geen database, geen analytics, \
                 geen gegevens die het toestel verlaten — zie de ",
                a!(href = "/privacy", "volledige privacyverklaring"),
                ".",
            ),
        ),
    )
}

fn section_gebruik() -> impl IntoHtml {
    section!(
        class = "about-section",
        h2!("Hoe gebruik je de app?"),
        ol!(
            li!("Kies een oefening op de startpagina."),
            li!("Stel het aantal vragen en de moeilijkheidsgraad in \
                 — elke oefening heeft eigen opties."),
            li!("Zit naast je kind en druk op \"start met oefenen\"."),
            li!("Na de oefenronde zie je het resultaat: \
                 hoeveel goed, wat moeilijk was en hoe lang het duurde."),
            li!("Gebruik de knop \"oefen fouten opnieuw\" om gericht \
                 de moeilijkste vragen te herhalen."),
        ),
        p!("In het configuratiescherm (vóór je start) vind je ook de \
             oefengeschiedenis van eerdere sessies, zodat je de vooruitgang \
             kunt opvolgen."),
    )
}

fn section_plabayo() -> impl IntoHtml {
    section!(
        class = "about-section",
        h2!("Over Plabayo"),
        p!(
            "Plabayo is een kleine technologiestudio. We hebben deze app gemaakt \
             voor onze eigen kinderen en delen hem graag gratis met iedereen. \
             De broncode is beschikbaar op ",
            a!(href = "https://github.com/plabayo/homework", "GitHub ⛰️",),
            "."
        ),
        p!(
            "De app is gebouwd met ",
            a!(href = "https://ramaproxy.org", "Rama"),
            ", een open-source Rust-framework dat ook door Plabayo wordt onderhouden. \
             De hosting wordt gesponsord door ",
            a!(href = "https://fly.io", "Fly.io"),
            "."
        ),
    )
}

fn section_bijdragen() -> impl IntoHtml {
    section!(
        class = "about-section",
        h2!("Bijdragen en contact"),
        p!(
            "Heb je een idee, een fout gevonden, of wil je gewoon iets kwijt? \
             We horen het graag!"
        ),
        ul!(
            li!(
                "Stuur een mail naar ",
                a!(href = "mailto:hello@plabayo.tech", "hello@plabayo.tech ✉️",),
                " voor feedback, suggesties of vragen."
            ),
            li!(
                "Open een issue op ",
                a!(
                    href = "https://github.com/plabayo/homework/issues",
                    "GitHub",
                ),
                " voor bugs of ideeën voor nieuwe oefeningen."
            ),
            li!(
                "Codebijdragen zijn welkom — lees eerst even ",
                a!(
                    href = "https://github.com/plabayo/homework/blob/main/CONTRIBUTING.md",
                    "CONTRIBUTING.md",
                ),
                "."
            ),
        ),
        p!(
            "Wil je het project financieel steunen? Trakteer ons op ",
            a!(
                href = "https://www.buymeacoffee.com/plabayo",
                "een koffie ☕",
            ),
            " of word ",
            a!(
                href = "https://github.com/sponsors/plabayo",
                "GitHub Sponsor 😻",
            ),
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
            a!(href = "/privacy", "Privacy"),
        )),
    )
}

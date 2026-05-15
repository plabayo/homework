// Copyright (C) 2024-2026 Plabayo
// See LICENSE in the repository root for details.
// Source-available; non-commercial use only.

use rama::http::HeaderMap;
use rama::http::html::PreEscaped;

struct BannerLang {
    /// BCP-47 primary language subtag (e.g. "fr", "de", "zh").
    tag: &'static str,
    /// True for right-to-left scripts.
    rtl: bool,
    /// Banner text shown immediately before the mailto link.
    prefix: &'static str,
    /// Banner text shown immediately after the mailto link.
    suffix: &'static str,
    /// Label for the dismiss button.
    dismiss: &'static str,
}

static LANGS: &[BannerLang] = &[
    BannerLang {
        tag: "en",
        rtl: false,
        prefix: "This open learning platform is built for the Flemish educational system and is intentionally only available in Dutch. For other languages or educational systems, please reach out to us at\u{a0}",
        suffix: ".",
        dismiss: "Got it",
    },
    BannerLang {
        tag: "fr",
        rtl: false,
        prefix: "Cette plateforme d’apprentissage ouverte est conçue pour le système éducatif flamand et est intentionnellement disponible uniquement en néerlandais. Pour d’autres langues ou systèmes éducatifs, contactez-nous à\u{a0}",
        suffix: ".",
        dismiss: "Compris",
    },
    BannerLang {
        tag: "de",
        rtl: false,
        prefix: "Diese offene Lernplattform ist für das flämische Bildungssystem konzipiert und absichtlich nur auf Niederländisch verfügbar. Für andere Sprachen oder Bildungssysteme wenden Sie sich bitte an\u{a0}",
        suffix: ".",
        dismiss: "Verstanden",
    },
    BannerLang {
        tag: "es",
        rtl: false,
        prefix: "Esta plataforma de aprendizaje abierta está diseñada para el sistema educativo flamenco y está disponible intencionalmente solo en neerlandés. Para otros idiomas o sistemas educativos, contáctenos en\u{a0}",
        suffix: ".",
        dismiss: "Entendido",
    },
    BannerLang {
        tag: "it",
        rtl: false,
        prefix: "Questa piattaforma di apprendimento aperta è progettata per il sistema educativo fiammingo ed è disponibile intenzionalmente solo in olandese. Per altre lingue o sistemi educativi, contattaci all’indirizzo\u{a0}",
        suffix: ".",
        dismiss: "Capito",
    },
    BannerLang {
        tag: "pt",
        rtl: false,
        prefix: "Esta plataforma de aprendizagem aberta foi desenvolvida para o sistema educativo flamengo e está disponível intencionalmente apenas em neerlandês. Para outros idiomas ou sistemas educativos, contacte-nos em\u{a0}",
        suffix: ".",
        dismiss: "Entendido",
    },
    BannerLang {
        tag: "ar",
        rtl: true,
        prefix: "هذه المنصة التعليمية المفتوحة مصممة للنظام التعليمي الفلمنكي ومتاحة عن قصد باللغة الهولندية فقط. للغات أو أنظمة تعليمية أخرى، تواصل معنا عبر\u{a0}",
        suffix: ".",
        dismiss: "حسناً",
    },
    BannerLang {
        tag: "ru",
        rtl: false,
        prefix: "Эта открытая образовательная платформа создана для фламандской системы образования и намеренно доступна только на нидерландском. Для других языков или систем образования свяжитесь с нами:\u{a0}",
        suffix: ".",
        dismiss: "Понятно",
    },
    BannerLang {
        tag: "zh",
        rtl: false,
        prefix: "这个开放式学习平台为弗拉芒教育体系而设计，特意仅提供荷兰语版本。如需其他语言或教育体系支持，请联系我们：",
        suffix: "",
        dismiss: "知道了",
    },
    BannerLang {
        tag: "ja",
        rtl: false,
        prefix: "このオープン学習プラットフォームはフランドルの教育制度向けに設計され、意図的にオランダ語のみで提供されています。他の言語や教育制度が必要な場合はご連絡ください：",
        suffix: "",
        dismiss: "了解",
    },
    BannerLang {
        tag: "ko",
        rtl: false,
        prefix: "이 오픈 학습 플랫폼은 플랑드르 교육 시스템을 위해 제작되었으며 의도적으로 네덜란드어로만 제공됩니다. 다른 언어나 교육 시스템이 필요하시면 문의하세요：",
        suffix: "",
        dismiss: "알겠습니다",
    },
    BannerLang {
        tag: "tr",
        rtl: false,
        prefix: "Bu açık öğrenme platformu Flamanca eğitim sistemi için tasarlanmış olup kasıtlı olarak yalnızca Hollandaca sunulmaktadır. Diğer dil veya eğitim sistemleri için bize ulaşın:\u{a0}",
        suffix: "",
        dismiss: "Anladım",
    },
    BannerLang {
        tag: "pl",
        rtl: false,
        prefix: "Ta otwarta platforma edukacyjna jest stworzona dla flamandzkiego systemu edukacji i celowo dostępna tylko w języku niderlandzkim. W przypadku innych języków lub systemów edukacyjnych prosimy o kontakt:\u{a0}",
        suffix: "",
        dismiss: "Rozumiem",
    },
    BannerLang {
        tag: "ro",
        rtl: false,
        prefix: "Această platformă deschisă de învățare este concepută pentru sistemul educațional flamand și este disponibilă în mod intențional numai în olandeză. Pentru alte limbi sau sisteme educaționale, contactați-ne la\u{a0}",
        suffix: ".",
        dismiss: "Am înțeles",
    },
    BannerLang {
        tag: "uk",
        rtl: false,
        prefix: "Ця відкрита навчальна платформа створена для фламандської системи освіти та навмисно доступна лише нідерландською. Для інших мов чи систем освіти зв’яжіться з нами:\u{a0}",
        suffix: "",
        dismiss: "Зрозуміло",
    },
    BannerLang {
        tag: "fa",
        rtl: true,
        prefix: "این پلتفرم آموزشی آزاد برای سیستم آموزشی فلامندر طراحی شده و عمداً فقط به زبان هلندی ارائه می‌شود. برای زبان‌ها یا سیستم‌های آموزشی دیگر با ما تماس بگیرید:\u{a0}",
        suffix: "",
        dismiss: "متوجه شدم",
    },
    BannerLang {
        tag: "hi",
        rtl: false,
        prefix: "यह खुला शिक्षण मंच फ्लेमिश शिक्षा प्रणाली के लिए बनाया गया है और जानबूझकर केवल डच में उपलब्ध है. अन्य भाषाओं या शिक्षा प्रणालियों के लिए हमसे संपर्क करें:\u{a0}",
        suffix: "",
        dismiss: "समझ गया",
    },
    BannerLang {
        tag: "sv",
        rtl: false,
        prefix: "Denna öppna lärplattform är byggd för det flamländska utbildningssystemet och är avsiktligt bara tillgänglig på nederländska. För andra språk eller utbildningssystem, kontakta oss på\u{a0}",
        suffix: ".",
        dismiss: "Uppfattat",
    },
    BannerLang {
        tag: "el",
        rtl: false,
        prefix: "Αυτή η ανοιχτή πλατφόρμα μάθησης είναι σχεδιασμένη για το φλαμανδικό εκπαιδευτικό σύστημα και είναι σκόπιμα διαθέσιμη μόνο στα ολλανδικά. Για άλλες γλώσσες ή εκπαιδευτικά συστήματα, επικοινωνήστε μαζί μας στο\u{a0}",
        suffix: ".",
        dismiss: "Κατανοητό",
    },
    BannerLang {
        tag: "vi",
        rtl: false,
        prefix: "Nền tảng học tập mở này được xây dựng cho hệ thống giáo dục Flemish và chỉ có sẵn bằng tiếng Hà Lan. Với các ngôn ngữ hoặc hệ thống giáo dục khác, hãy liên hệ với chúng tôi tại\u{a0}",
        suffix: ".",
        dismiss: "Đã hiểu",
    },
    BannerLang {
        tag: "id",
        rtl: false,
        prefix: "Platform pembelajaran terbuka ini dirancang untuk sistem pendidikan Flemish dan sengaja hanya tersedia dalam bahasa Belanda. Untuk bahasa atau sistem pendidikan lain, hubungi kami di\u{a0}",
        suffix: ".",
        dismiss: "Mengerti",
    },
    BannerLang {
        tag: "hu",
        rtl: false,
        prefix: "Ez a nyílt tanulási platform a flamand oktatási rendszerre épül, és szándékosan csak hollandul érhető el. Más nyelvekért vagy oktatási rendszerekért vegye fel velünk a kapcsolatot:\u{a0}",
        suffix: "",
        dismiss: "Értem",
    },
    BannerLang {
        tag: "cs",
        rtl: false,
        prefix: "Tato otevřená vzdělávací platforma je vytvořena pro flámský vzdělávací systém a je záměrně dostupná pouze v nizozemštině. Pro jiné jazyky nebo vzdělávací systémy nás kontaktujte na\u{a0}",
        suffix: ".",
        dismiss: "Rozumím",
    },
    BannerLang {
        tag: "bn",
        rtl: false,
        prefix: "এই উন্মুক্ত শিক্ষা প্ল্যাটফর্মটি ফ্লেমিশ শিক্ষাব্যবস্থার জন্য তৈরি এবং ইচ্ছাকৃতভাবে শুধুমাত্র ডাচ ভাষায় পাওয়া যায়। অন্য ভাষা বা শিক্ষাব্যবস্থার জন্য আমাদের সাথে যোগাযোগ করুন:\u{a0}",
        suffix: "",
        dismiss: "বুঝেছি",
    },
];

/// Returns rendered banner HTML when the request headers indicate that the user
/// does not prefer Dutch *and* has not previously dismissed the banner (cookie absent).
/// Returns `PreEscaped(String::new())` when no banner is needed.
pub(crate) fn lang_banner(headers: &HeaderMap) -> PreEscaped<String> {
    if lang_ok_cookie_set(headers) {
        return PreEscaped(String::new());
    }
    let accept_lang = headers
        .get("accept-language")
        .and_then(|v| v.to_str().ok())
        .unwrap_or("");
    if accepts_nl(accept_lang) {
        return PreEscaped(String::new());
    }
    let t = find_translation(accept_lang);
    PreEscaped(render_banner(t))
}

fn lang_ok_cookie_set(headers: &HeaderMap) -> bool {
    headers
        .get("cookie")
        .and_then(|v| v.to_str().ok())
        .map(|s| s.split(';').any(|c| c.trim() == "lang_ok=1"))
        .unwrap_or(false)
}

fn accepts_nl(accept_lang: &str) -> bool {
    accept_lang.split(',').any(|range| {
        let tag = range
            .split(';')
            .next()
            .unwrap_or("")
            .trim()
            .to_ascii_lowercase();
        tag == "nl" || tag.starts_with("nl-")
    })
}

fn find_translation(accept_lang: &str) -> &'static BannerLang {
    for range in accept_lang.split(',') {
        let tag = range
            .split(';')
            .next()
            .unwrap_or("")
            .trim()
            .to_ascii_lowercase();
        for lang in LANGS {
            let matches = tag == lang.tag
                || (tag.starts_with(lang.tag) && tag[lang.tag.len()..].starts_with('-'));
            if matches {
                return lang;
            }
        }
    }
    #[expect(
        clippy::expect_used,
        reason = "EN is always present; this is an invariant"
    )]
    LANGS
        .iter()
        .find(|l| l.tag == "en")
        .expect("English must be in LANGS")
}

/// Escape the five HTML special characters. `prefix`/`suffix`/`dismiss` are
/// `&'static str` compile-time constants with no metacharacters today, but
/// explicit escaping keeps the function correct if translations are ever
/// sourced dynamically.
fn html_escape(s: &str) -> std::borrow::Cow<'_, str> {
    if !s.contains(['&', '<', '>', '"', '\'']) {
        return std::borrow::Cow::Borrowed(s);
    }
    std::borrow::Cow::Owned(
        s.replace('&', "&amp;")
            .replace('<', "&lt;")
            .replace('>', "&gt;")
            .replace('"', "&quot;")
            .replace('\'', "&#39;"),
    )
}

fn render_banner(t: &BannerLang) -> String {
    let dir = if t.rtl { r#" dir="rtl""# } else { "" };
    format!(
        r#"<div id="lang-banner" class="lang-banner" role="alert"{dir}><p>{prefix}<a href="mailto:hello@plabayo.tech">hello@plabayo.tech</a>{suffix}</p><button type="button" class="btn" id="lang-banner-dismiss">{dismiss}</button></div>"#,
        prefix = html_escape(t.prefix),
        suffix = html_escape(t.suffix),
        dismiss = html_escape(t.dismiss),
    )
}

#[cfg(test)]
mod tests {
    #![allow(clippy::unwrap_used, clippy::expect_used)]
    use super::*;

    fn make_headers(accept_lang: &str) -> HeaderMap {
        let mut h = HeaderMap::new();
        h.insert("accept-language", accept_lang.parse().unwrap());
        h
    }

    #[test]
    fn nl_be_is_accepted() {
        assert!(accepts_nl("nl-BE,nl;q=0.9,fr;q=0.8"));
    }

    #[test]
    fn nl_bare_is_accepted() {
        assert!(accepts_nl("nl"));
    }

    #[test]
    fn nl_nl_is_accepted() {
        assert!(accepts_nl("nl-NL"));
    }

    #[test]
    fn en_us_is_not_nl() {
        assert!(!accepts_nl("en-US,en;q=0.9"));
    }

    #[test]
    fn empty_accept_lang_is_not_nl() {
        assert!(!accepts_nl(""));
    }

    #[test]
    fn lang_banner_empty_for_nl_be() {
        let headers = make_headers("nl-BE,nl;q=0.9");
        assert!(lang_banner(&headers).0.is_empty());
    }

    #[test]
    fn lang_banner_present_for_en() {
        let headers = make_headers("en-US,en;q=0.9");
        assert!(!lang_banner(&headers).0.is_empty());
    }

    #[test]
    fn lang_banner_empty_when_cookie_set() {
        let mut headers = make_headers("en-US");
        headers.insert("cookie", "lang_ok=1".parse().unwrap());
        assert!(lang_banner(&headers).0.is_empty());
    }

    #[test]
    fn lang_banner_empty_when_cookie_among_others() {
        let mut headers = make_headers("en-US");
        headers.insert(
            "cookie",
            "session=abc; lang_ok=1; theme=dark".parse().unwrap(),
        );
        assert!(lang_banner(&headers).0.is_empty());
    }

    #[test]
    fn find_translation_returns_english_for_unknown_lang() {
        let t = find_translation("xx-YY");
        assert_eq!(t.tag, "en");
    }

    #[test]
    fn find_translation_matches_french() {
        let t = find_translation("fr-FR,fr;q=0.9");
        assert_eq!(t.tag, "fr");
    }

    #[test]
    fn rendered_banner_contains_email_link() {
        let headers = make_headers("en-US");
        let banner = lang_banner(&headers);
        assert!(banner.0.contains("hello@plabayo.tech"));
        assert!(banner.0.contains("lang-banner-dismiss"));
    }

    #[test]
    fn rtl_banner_has_dir_attribute() {
        let headers = make_headers("ar");
        let banner = lang_banner(&headers);
        assert!(banner.0.contains(r#"dir="rtl""#));
    }

    #[test]
    fn ltr_banner_has_no_dir_attribute() {
        let headers = make_headers("en");
        let banner = lang_banner(&headers);
        assert!(!banner.0.contains("dir="));
    }
}

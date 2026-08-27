// Copyright (C) 2024-2026 Plabayo
// See LICENSE in the repository root for details.
// Source-available; non-commercial use only.

//! Typed schema.org documents rendered through Rama's JSON-LD support.

use std::sync::{LazyLock, OnceLock};

use rama::http::protocols::json_ld::JsonLd;
use serde::Serialize;

use crate::service::exercises::{ExerciseInfo, all_exercises, breadcrumb_level_label};

const CONTEXT: &str = "https://schema.org";
const ORIGIN: &str = "https://elementary.training";
const SITE_ID: &str = "https://elementary.training/#site";
const PUBLISHER_ID: &str = "https://elementary.training/#publisher";
const LICENSE: &str = "https://github.com/plabayo/homework/blob/main/LICENSE";

static SITE: LazyLock<JsonLd> = LazyLock::new(|| {
    serialize(&Document {
        context: CONTEXT,
        graph: (
            WebSite {
                schema_type: SchemaType::WebSite,
                id: SITE_ID,
                url: "https://elementary.training/",
                name: "Oefeningen Basisschool",
                description: "Gratis huiswerk middel voor de basisschool. Geen account, geen tracking, volledig offline na het eerste bezoek.",
                in_language: "nl-BE",
                publisher: IdReference { id: PUBLISHER_ID },
            },
            EducationalOrganization {
                schema_type: SchemaType::EducationalOrganization,
                id: PUBLISHER_ID,
                name: "Plabayo",
                url: "https://plabayo.tech",
                same_as: [
                    "https://github.com/plabayo",
                    "https://github.com/plabayo/homework",
                ],
            },
        ),
    })
});

/// Site-wide publisher and website identity emitted on every HTML page.
pub fn site() -> &'static JsonLd {
    &SITE
}

/// Return the lazily serialised learning-resource document for an exercise.
/// Catalogue entries are immutable, so each document is built at most once.
pub fn exercise(info: ExerciseInfo, description: &'static str) -> &'static JsonLd {
    static DOCUMENTS: LazyLock<Vec<OnceLock<JsonLd>>> =
        LazyLock::new(|| all_exercises().iter().map(|_| OnceLock::new()).collect());

    let Some(index) = all_exercises()
        .iter()
        .position(|candidate| candidate.id == info.id)
    else {
        unreachable!("exercise JSON-LD requested for an unregistered exercise");
    };
    DOCUMENTS[index].get_or_init(|| build_exercise_document(info, description))
}

fn build_exercise_document(info: ExerciseInfo, description: &'static str) -> JsonLd {
    let url = format!("{ORIGIN}{}", info.path);
    let resource_id = format!("{url}#resource");
    let level_name = breadcrumb_level_label(info.level);

    serialize(&Document {
        context: CONTEXT,
        graph: (
            LearningResource {
                schema_type: SchemaType::LearningResource,
                id: resource_id,
                url,
                name: info.label,
                description,
                in_language: "nl-BE",
                is_accessible_for_free: true,
                learning_resource_type: LearningResourceType::Exercise,
                educational_level: level_name,
                audience: EducationalAudience {
                    schema_type: SchemaType::EducationalAudience,
                    educational_role: EducationalRole::Student,
                },
                license: LICENSE,
                is_part_of: IdReference { id: SITE_ID },
            },
            BreadcrumbList {
                schema_type: SchemaType::BreadcrumbList,
                item_list_element: [
                    ListItem {
                        schema_type: SchemaType::ListItem,
                        position: 1,
                        name: "start",
                        item: Some("https://elementary.training/".to_owned()),
                    },
                    ListItem {
                        schema_type: SchemaType::ListItem,
                        position: 2,
                        name: level_name,
                        item: Some(format!("{ORIGIN}/#niveau-{}", info.level)),
                    },
                    ListItem {
                        schema_type: SchemaType::ListItem,
                        position: 3,
                        name: info.label,
                        item: None,
                    },
                ],
            },
        ),
    })
}

fn serialize(value: &impl Serialize) -> JsonLd {
    match JsonLd::serialize(value) {
        Ok(document) => document,
        Err(error) => unreachable!("built-in JSON-LD model failed to serialize: {error}"),
    }
}

#[derive(Serialize)]
struct Document<T> {
    #[serde(rename = "@context")]
    context: &'static str,
    #[serde(rename = "@graph")]
    graph: T,
}

#[derive(Serialize)]
enum SchemaType {
    WebSite,
    EducationalOrganization,
    LearningResource,
    EducationalAudience,
    BreadcrumbList,
    ListItem,
}

#[derive(Serialize)]
enum LearningResourceType {
    Exercise,
}

#[derive(Serialize)]
#[serde(rename_all = "lowercase")]
enum EducationalRole {
    Student,
}

#[derive(Serialize)]
struct IdReference<T> {
    #[serde(rename = "@id")]
    id: T,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct WebSite {
    #[serde(rename = "@type")]
    schema_type: SchemaType,
    #[serde(rename = "@id")]
    id: &'static str,
    url: &'static str,
    name: &'static str,
    description: &'static str,
    in_language: &'static str,
    publisher: IdReference<&'static str>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct EducationalOrganization {
    #[serde(rename = "@type")]
    schema_type: SchemaType,
    #[serde(rename = "@id")]
    id: &'static str,
    name: &'static str,
    url: &'static str,
    same_as: [&'static str; 2],
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct LearningResource {
    #[serde(rename = "@type")]
    schema_type: SchemaType,
    #[serde(rename = "@id")]
    id: String,
    url: String,
    name: &'static str,
    description: &'static str,
    in_language: &'static str,
    is_accessible_for_free: bool,
    learning_resource_type: LearningResourceType,
    educational_level: &'static str,
    audience: EducationalAudience,
    license: &'static str,
    is_part_of: IdReference<&'static str>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct EducationalAudience {
    #[serde(rename = "@type")]
    schema_type: SchemaType,
    educational_role: EducationalRole,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct BreadcrumbList {
    #[serde(rename = "@type")]
    schema_type: SchemaType,
    item_list_element: [ListItem; 3],
}

#[derive(Serialize)]
struct ListItem {
    #[serde(rename = "@type")]
    schema_type: SchemaType,
    position: u8,
    name: &'static str,
    #[serde(skip_serializing_if = "Option::is_none")]
    item: Option<String>,
}

#[cfg(test)]
mod tests {
    use serde_json::Value;

    use super::*;
    use crate::service::exercises::multiplications;

    #[test]
    fn site_document_has_typed_graph() -> Result<(), serde_json::Error> {
        let value: Value = site().deserialize()?;

        assert_eq!(value["@graph"][0]["@type"], "WebSite");
        assert_eq!(value["@graph"][1]["@type"], "EducationalOrganization");
        Ok(())
    }

    #[test]
    fn exercise_document_uses_catalogue_metadata() -> Result<(), serde_json::Error> {
        const DESCRIPTION: &str = "Oefen de maaltafels van 1 tot en met 10.";
        let value: Value = exercise(multiplications::INFO, DESCRIPTION).deserialize()?;
        let resource = &value["@graph"][0];
        let level = &value["@graph"][1]["itemListElement"][1];

        assert_eq!(resource["@type"], "LearningResource");
        assert_eq!(resource["name"], multiplications::INFO.label);
        assert_eq!(resource["description"], DESCRIPTION);
        assert_eq!(level["name"], "Niveau 1");
        assert_eq!(level["item"], "https://elementary.training/#niveau-1");
        Ok(())
    }

    #[test]
    fn exercise_document_is_cached() {
        const DESCRIPTION: &str = "Oefen de maaltafels van 1 tot en met 10.";
        let first = exercise(multiplications::INFO, DESCRIPTION);
        let second = exercise(multiplications::INFO, DESCRIPTION);
        assert!(std::ptr::eq(first, second));
    }
}

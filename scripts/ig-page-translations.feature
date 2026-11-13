Feature: An IG's narrative pages in the locales its translation catalogues fill

  @test:scripts/ig-page-translations.test.ts::ig-page-translations_(fhir-harness#382)::a_locale_with_an_empty_catalogue,_and_the_source_locale,_are_not_offered
  Scenario: a locale whose catalogue is empty, and the source locale, are not offered
    Given French, Arabic and English catalogues of the index page, with only French filled
    Then the only locale offered is French, and it is unverified
    And the index page is offered in English and French, and another page in English only

  @test:scripts/ig-page-translations.test.ts::ig-page-translations_(fhir-harness#382)::no_translations_directory:_no_locales
  Scenario: with no translations directory there are no locales
    Then no directory, or one that does not exist, gives no locales

  @test:scripts/ig-page-translations.test.ts::ig-page-translations_(fhir-harness#382)::injects_the_catalogue_into_the_page
  Scenario: the catalogue is injected into the page
    Given the French catalogue of the index page
    When the page is translated
    Then it holds the French text and counts one translated message

  @test:scripts/ig-page-translations.test.ts::ig-page-translations_(fhir-harness#382)::a_locale_is_verified_only_with_a_named_sign-off
  Scenario: a locale is verified only with a named sign-off
    Then a status marked official without a sign-off is not signed off
    And a status naming who signed off and when is signed off

  @test:scripts/ig-page-translations.test.ts::ig-page-translations_(fhir-harness#382)::relative_links_climb_out_of_the_locale_folder_unless_the_target_is_translated
  Scenario: relative links climb out of the locale folder unless the target is translated
    Given a page linking a translated page, untranslated pages and an image, an external URL, an anchor, a Liquid base URL and a rooted path
    When it is relinked for the locale
    Then only the links to untranslated pages and the image gain "../", in markdown and in HTML

  @test:scripts/ig-page-translations.test.ts::ig-page-translations_(fhir-harness#382)::Arabic_is_right_to_left
  Scenario: Arabic is right to left
    Then Arabic is rtl and French is ltr

  @test:scripts/ig-page-translations.test.ts::ig-page-translations_(fhir-harness#382)::a_page_made_only_of_includes_is_translated_through_them_(home_page)
  Scenario: a page made only of includes is translated through them
    Given a home page that includes the translated index page and an untranslated page
    Then the home page has a translation and the untranslated page has none
    And the translated home page holds the French text and keeps the include of the untranslated page

  @test:scripts/ig-page-translations.test.ts::lang-fragment:_a_translated_page_reads_its_locale's_own_fragment::names_the_fragment_as_the_IG_Publisher_does
  Scenario: the locale's fragment is named as the IG Publisher names it
    Then the locale code goes before the extension, or at the end of a name without one

  @test:scripts/ig-page-translations.test.ts::lang-fragment:_a_translated_page_reads_its_locale's_own_fragment::the_locale's_fragment_when_the_IG_has_it,_the_source's_otherwise;_the_source_page_always_the_source's
  Scenario: a lang-fragment resolves to the locale's fragment when the IG has it, the source's otherwise
    Given a page with two lang-fragment tags, one with whitespace control, and an IG with only the Arabic cards fragment
    Then in Arabic the cards include the Arabic fragment and the hero the source one
    And in French both include the source fragments
    And the source page always includes the source fragments

  @test:scripts/ig-page-translations.test.ts::lang-fragment:_a_translated_page_reads_its_locale's_own_fragment::a_translated_page_keeps_its_lang-fragment_for_the_build_to_resolve
  Scenario: a translated page keeps its lang-fragment tag for the build to resolve
    Given a page with a lang-fragment tag and a sentence the catalogue translates
    When it is translated
    Then the lang-fragment tag is kept and the sentence is translated

Feature: The IG's quality checks page

  @test:scripts/ig-qa-page.test.ts::readsRecordsKeepsUnreadable
  Scenario: reads qa-results/v1 and reports anything else as unreadable, never drops it
    Given a directory holding a valid QA record, one of another schema, a broken one and an unrelated JSON file
    When the QA records are read
    Then the three QA record files are read, sorted, and two are unreadable

  @test:scripts/ig-qa-page.test.ts::rendersFamiliesInsideRaw
  Scenario: renders families, entries and the record link inside raw
    Given a directory holding one QA record
    When the QA page is rendered
    Then it is wrapped in a raw block and says "2 finding(s)."
    And it links the record, escapes a pipe, and shows the entries as a table, Liquid text as written
    And it has no section for a clean family

  @test:scripts/ig-qa-page.test.ts::noRecordSaysSo
  Scenario: says so when the directory holds no record
    Then a page with no records says no check has written a record

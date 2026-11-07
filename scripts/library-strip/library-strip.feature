Feature: The Library strippers and their upstream copies

  @test:scripts/library-strip/library-strip.test.ts::contentReplacesInlineCql
  Scenario: strip_library_content replaces inline CQL with a reference to the standalone file
    Given a Library with inline CQL and ELM
    When strip_library_content.py runs
    Then its first content is a reference to "Library-Foo.cql"

  @test:scripts/library-strip/library-strip.test.ts::binariesExtractsElm
  Scenario: strip_library_binaries extracts the ELM to a file and references it
    Given a Library with inline CQL and ELM
    When strip_library_binaries.py runs
    Then its second content is a reference to "Library-Foo.elm.json"
    And that file is written

  @test:scripts/library-strip/library-strip.test.ts::copyMatchesReadmeSha
  Scenario Outline: <f> matches its recorded sha256
    Given the copied script <f>
    Then its sha256 is the one the README records

    Examples:
      | f |
      | strip_library_binaries.py |
      | strip_library_content.py |

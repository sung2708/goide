import { describe, expect, it } from "vitest";
import { EditorState } from "@codemirror/state";
import { closeBrackets, insertBracket } from "@codemirror/autocomplete";

const AUTO_PAIR_DELIMITERS = ['"', "'", "(", "{", "["] as const;

const DELIMITER_PAIRS: Record<string, string> = {
  '"': '"',
  "'": "'",
  "(": ")",
  "{": "}",
  "[": "]",
};

describe("CodeEditor bracket behavior", () => {
  it("tracks the expected auto-pair delimiter set", () => {
    expect(AUTO_PAIR_DELIMITERS).toEqual(['"', "'", "(", "{", "["]);
  });

  it("auto-inserts matching closing delimiters for all configured open delimiters", () => {
    for (const delimiter of AUTO_PAIR_DELIMITERS) {
      const state = EditorState.create({
        doc: "",
        extensions: [closeBrackets()],
      });
      const transaction = insertBracket(state, delimiter);
      expect(transaction).not.toBeNull();

      const nextState = transaction?.state;
      expect(nextState?.doc.toString()).toBe(`${delimiter}${DELIMITER_PAIRS[delimiter]}`);
      expect(nextState?.selection.main.head).toBe(1);
    }
  });

  it("skips over existing auto-inserted closing delimiters instead of duplicating", () => {
    for (const delimiter of AUTO_PAIR_DELIMITERS) {
      const closingDelimiter = DELIMITER_PAIRS[delimiter];
      const initialState = EditorState.create({
        doc: "",
        extensions: [closeBrackets()],
      });
      const openingTransaction = insertBracket(initialState, delimiter);
      expect(openingTransaction).not.toBeNull();

      const stateWithPair = openingTransaction?.state as EditorState;

      const transaction = insertBracket(stateWithPair, closingDelimiter);
      expect(transaction).not.toBeNull();
      expect(transaction?.state.doc.toString()).toBe(`${delimiter}${closingDelimiter}`);
      expect(transaction?.state.selection.main.head).toBe(2);
    }
  });

  it("surrounds selected text with typed opening delimiters", () => {
    for (const delimiter of AUTO_PAIR_DELIMITERS) {
      const state = EditorState.create({
        doc: "abc",
        selection: { anchor: 0, head: 3 },
        extensions: [closeBrackets()],
      });

      const transaction = insertBracket(state, delimiter);
      expect(transaction).not.toBeNull();
      expect(transaction?.state.doc.toString()).toBe(
        `${delimiter}abc${DELIMITER_PAIRS[delimiter]}`
      );
    }
  });
});

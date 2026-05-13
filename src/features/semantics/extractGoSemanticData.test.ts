import { describe, expect, it } from "vitest";
import { extractGoSemanticData, type SemanticSyntaxNode } from "./extractGoSemanticData";

function node(
  type: string,
  startIndex: number,
  endIndex: number,
  options: {
    fields?: Record<string, SemanticSyntaxNode | null>;
    namedChildren?: SemanticSyntaxNode[];
  } = {}
): SemanticSyntaxNode {
  return {
    type,
    startIndex,
    endIndex,
    namedChildren: options.namedChildren ?? [],
    childForFieldName(fieldName) {
      return options.fields?.[fieldName] ?? null;
    },
  };
}

describe("extractGoSemanticData", () => {
  it("returns selectionRanges sorted ascending by size", () => {
    const source = "x".repeat(200);
    const small = node("identifier", 10, 20);
    const medium = node("expression", 0, 100, { namedChildren: [small] });
    const large = node("statement", 0, 200, { namedChildren: [medium] });
    const root = node("source_file", 0, 200, { namedChildren: [large] });

    const { selectionRanges } = extractGoSemanticData(root, source);

    const sizes = selectionRanges.map((r) => r.to - r.from);
    expect(sizes).toEqual([...sizes].sort((a, b) => a - b));
    expect(sizes.length).toBeGreaterThan(0);
  });

  it("extracts Go symbols and fold ranges from a syntax tree", () => {
    const source = `package main

type Worker struct {
\tjobs chan int
}

type Runner interface {
\tRun() error
}

func main() {
\tprintln("hi")
}

func (s *Server) Serve() {
\tprintln("serving")
}
`;

    const workerName = node("type_identifier", source.indexOf("Worker"), source.indexOf("Worker") + 6);
    const workerStruct = node(
      "struct_type",
      source.indexOf("struct"),
      source.indexOf("}\n\n", source.indexOf("type Worker")) + 1
    );
    const workerTypeSpec = node(
      "type_spec",
      source.indexOf("type Worker"),
      source.indexOf("}\n\n", source.indexOf("type Worker")) + 1,
      {
        fields: {
          name: workerName,
          type: workerStruct,
        },
      }
    );

    const runnerName = node("type_identifier", source.indexOf("Runner"), source.indexOf("Runner") + 6);
    const runnerInterface = node(
      "interface_type",
      source.indexOf("interface"),
      source.indexOf("}\n\n", source.indexOf("type Runner")) + 1
    );
    const runnerTypeSpec = node(
      "type_spec",
      source.indexOf("type Runner"),
      source.indexOf("}\n\n", source.indexOf("type Runner")) + 1,
      {
        fields: {
          name: runnerName,
          type: runnerInterface,
        },
      }
    );

    const mainName = node("identifier", source.indexOf("main()"), source.indexOf("main()") + 4);
    const mainBody = node(
      "block",
      source.indexOf("{", source.indexOf("func main")),
      source.indexOf("}\n\n", source.indexOf("func main")) + 1
    );
    const mainFunction = node(
      "function_declaration",
      source.indexOf("func main"),
      source.indexOf("}\n\n", source.indexOf("func main")) + 1,
      {
        fields: {
          name: mainName,
          body: mainBody,
        },
      }
    );

    const serveName = node("field_identifier", source.indexOf("Serve"), source.indexOf("Serve") + 5);
    const serveBody = node(
      "block",
      source.indexOf("{", source.indexOf("func (s *Server) Serve")),
      source.lastIndexOf("}") + 1
    );
    const serveMethod = node(
      "method_declaration",
      source.indexOf("func (s *Server) Serve"),
      source.lastIndexOf("}") + 1,
      {
        fields: {
          name: serveName,
          body: serveBody,
        },
      }
    );

    const root = node("source_file", 0, source.length, {
      namedChildren: [workerTypeSpec, runnerTypeSpec, mainFunction, serveMethod],
    });

    const result = extractGoSemanticData(root, source);

    expect(result.symbols).toEqual([
      {
        name: "Worker",
        kind: "struct",
        range: {
          from: source.indexOf("type Worker"),
          to: source.indexOf("}\n\n", source.indexOf("type Worker")) + 1,
        },
      },
      {
        name: "Runner",
        kind: "interface",
        range: {
          from: source.indexOf("type Runner"),
          to: source.indexOf("}\n\n", source.indexOf("type Runner")) + 1,
        },
      },
      {
        name: "main",
        kind: "function",
        range: {
          from: source.indexOf("func main"),
          to: source.indexOf("}\n\n", source.indexOf("func main")) + 1,
        },
      },
      {
        name: "Serve",
        kind: "method",
        range: {
          from: source.indexOf("func (s *Server) Serve"),
          to: source.lastIndexOf("}") + 1,
        },
      },
    ]);
    expect(result.folds).toEqual([
      {
        from: source.indexOf("{", source.indexOf("type Worker")) + 1,
        to: source.indexOf("}", source.indexOf("type Worker")),
      },
      {
        from: source.indexOf("{", source.indexOf("type Runner")) + 1,
        to: source.indexOf("}", source.indexOf("type Runner")),
      },
      {
        from: source.indexOf("{", source.indexOf("func main")) + 1,
        to: source.indexOf("}", source.indexOf("func main")),
      },
      {
        from: source.indexOf("{", source.indexOf("func (s *Server) Serve")) + 1,
        to: source.lastIndexOf("}"),
      },
    ]);
  });
});

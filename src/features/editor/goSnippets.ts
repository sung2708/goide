// Existing Goro snippets, expressed using Monaco snippet tab stops.
export const goSnippets = [
  {
    "label": "package main",
    "detail": "package declaration",
    "insertText": "package main\n\n$0",
    "context": "package"
  },
  {
    "label": "fmtp",
    "detail": "quick print line",
    "insertText": "fmt.Println(\"$0\")",
    "context": "general"
  },
  {
    "label": "ife",
    "detail": "error guard (fast)",
    "insertText": "if err != nil {\n\treturn $0\n}",
    "context": "general"
  },
  {
    "label": "gor",
    "detail": "goroutine (fast)",
    "insertText": "go func() {\n\t$0\n}()",
    "context": "general"
  },
  {
    "label": "func",
    "detail": "function declaration",
    "insertText": "func ${1:name}(${2:params}) {\n\t$0\n}",
    "context": "general"
  },
  {
    "label": "main",
    "detail": "main function",
    "insertText": "func main() {\n\t$0\n}",
    "context": "general"
  },
  {
    "label": "if",
    "detail": "if block",
    "insertText": "if ${1:condition} {\n\t$0\n}",
    "context": "general"
  },
  {
    "label": "iferr",
    "detail": "error guard",
    "insertText": "if err != nil {\n\treturn $0\n}",
    "context": "general"
  },
  {
    "label": "for",
    "detail": "for loop",
    "insertText": "for ${1:condition} {\n\t$0\n}",
    "context": "general"
  },
  {
    "label": "forr",
    "detail": "range loop",
    "insertText": "for ${1:key}, ${2:value} := range ${3:collection} {\n\t$0\n}",
    "context": "general"
  },
  {
    "label": "switch",
    "detail": "switch block",
    "insertText": "switch ${1:value} {\ncase ${2:caseValue}:\n\t$0\ndefault:\n\t$0\n}",
    "context": "general"
  },
  {
    "label": "select",
    "detail": "select block",
    "insertText": "select {\ncase ${1:value} := <-${2:channel}:\n\t$0\ndefault:\n\t$0\n}",
    "context": "general"
  },
  {
    "label": "gofn",
    "detail": "goroutine function",
    "insertText": "go func() {\n\t$0\n}()",
    "context": "general"
  },
  {
    "label": "defer",
    "detail": "deferred call",
    "insertText": "defer ${1:call}()",
    "context": "general"
  },
  {
    "label": "struct",
    "detail": "struct type",
    "insertText": "type ${1:Name} struct {\n\t$0\n}",
    "context": "general"
  },
  {
    "label": "interface",
    "detail": "interface type",
    "insertText": "type ${1:Name} interface {\n\t$0\n}",
    "context": "general"
  },
  {
    "label": "method",
    "detail": "method declaration",
    "insertText": "func (${1:receiver} *${2:Type}) ${3:name}(${4:params}) {\n\t$0\n}",
    "context": "general"
  },
  {
    "label": "test",
    "detail": "Go test",
    "insertText": "func Test${1:Name}(t *testing.T) {\n\t$0\n}",
    "context": "general"
  },
  {
    "label": "bench",
    "detail": "Go benchmark",
    "insertText": "func Benchmark${1:Name}(b *testing.B) {\n\tfor i := 0; i < b.N; i++ {\n\t\t$0\n\t}\n}",
    "context": "general"
  },
  {
    "label": "makechan",
    "detail": "channel allocation",
    "insertText": "${1:name} := make(chan ${2:type})",
    "context": "general"
  },
  {
    "label": "wg",
    "detail": "wait group",
    "insertText": "var wg sync.WaitGroup\n$0",
    "context": "general"
  },
  {
    "label": "mutex",
    "detail": "mutex",
    "insertText": "var mu sync.Mutex\n$0",
    "context": "general"
  },
  {
    "label": "main",
    "detail": "main function",
    "insertText": "main() {\n\t$0\n}",
    "context": "function"
  },
  {
    "label": "test",
    "detail": "Go test",
    "insertText": "Test${1:Name}(t *testing.T) {\n\t$0\n}",
    "context": "function"
  },
  {
    "label": "bench",
    "detail": "Go benchmark",
    "insertText": "Benchmark${1:Name}(b *testing.B) {\n\tfor i := 0; i < b.N; i++ {\n\t\t$0\n\t}\n}",
    "context": "function"
  }
];

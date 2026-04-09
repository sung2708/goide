import { useMemo } from "react";
import CodeMirror from "@uiw/react-codemirror";
import { goideEditorExtensions } from "./codemirrorTheme";

type CodeEditorProps = {
  value: string;
};

function CodeEditor({ value }: CodeEditorProps) {
  const extensions = useMemo(() => goideEditorExtensions, []);

  return (
    <div className="h-full w-full">
      <CodeMirror
        value={value}
        height="100%"
        width="100%"
        basicSetup={false}
        extensions={extensions}
        editable={false}
        readOnly
      />
    </div>
  );
}

export default CodeEditor;

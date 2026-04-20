import fileIcon from "../../assets/icons/catppuccin/frappe/_file.svg";
import folderIcon from "../../assets/icons/catppuccin/frappe/_folder.svg";
import folderOpenIcon from "../../assets/icons/catppuccin/frappe/_folder_open.svg";
import configIcon from "../../assets/icons/catppuccin/frappe/config.svg";
import cppIcon from "../../assets/icons/catppuccin/frappe/cpp.svg";
import dockerIcon from "../../assets/icons/catppuccin/frappe/docker.svg";
import gitIcon from "../../assets/icons/catppuccin/frappe/git.svg";
import goIcon from "../../assets/icons/catppuccin/frappe/go.svg";
import goModIcon from "../../assets/icons/catppuccin/frappe/go-mod.svg";
import goTemplateIcon from "../../assets/icons/catppuccin/frappe/go-template.svg";
import javascriptIcon from "../../assets/icons/catppuccin/frappe/javascript.svg";
import jsonIcon from "../../assets/icons/catppuccin/frappe/json.svg";
import markdownIcon from "../../assets/icons/catppuccin/frappe/markdown.svg";
import packageJsonIcon from "../../assets/icons/catppuccin/frappe/package-json.svg";
import pythonIcon from "../../assets/icons/catppuccin/frappe/python.svg";
import rustIcon from "../../assets/icons/catppuccin/frappe/rust.svg";
import tomlIcon from "../../assets/icons/catppuccin/frappe/toml.svg";
import typescriptIcon from "../../assets/icons/catppuccin/frappe/typescript.svg";
import yamlIcon from "../../assets/icons/catppuccin/frappe/yaml.svg";

type IconProps = {
  className?: string;
  size?: number;
};

type IconImageProps = IconProps & {
  src: string;
  alt: string;
};

function IconImage({ src, alt, className = "", size = 16 }: IconImageProps) {
  return (
    <img
      src={src}
      alt={alt}
      width={size}
      height={size}
      className={className}
      aria-hidden="true"
      draggable={false}
    />
  );
}

function isGoTestFile(fileName: string): boolean {
  return fileName.toLowerCase().endsWith("_test.go");
}

export const FileIcon = ({
  fileName,
  className = "",
  size = 16,
}: {
  fileName: string;
  className?: string;
  size?: number;
}) => {
  const normalizedName = fileName.toLowerCase();
  const parts = normalizedName.split(".");
  const ext = parts.length > 1 ? parts.pop() : undefined;

  if (normalizedName === "go.mod") {
    return <IconImage src={goModIcon} alt="go.mod" className={className} size={size} />;
  }
  if (normalizedName === "go.sum") {
    return <IconImage src={goModIcon} alt="go.sum" className={className} size={size} />;
  }
  if (normalizedName === "package.json") {
    return (
      <IconImage src={packageJsonIcon} alt="package.json" className={className} size={size} />
    );
  }
  if (normalizedName === "cargo.toml" || normalizedName === "cargo.lock") {
    return <IconImage src={rustIcon} alt={fileName} className={className} size={size} />;
  }
  if (normalizedName === "dockerfile" || normalizedName.startsWith("dockerfile.")) {
    return <IconImage src={dockerIcon} alt={fileName} className={className} size={size} />;
  }
  if (normalizedName === ".gitignore" || normalizedName === ".gitattributes") {
    return <IconImage src={gitIcon} alt={fileName} className={className} size={size} />;
  }

  switch (ext) {
    case "go":
      return (
        <IconImage
          src={isGoTestFile(normalizedName) ? goTemplateIcon : goIcon}
          alt={fileName}
          className={className}
          size={size}
        />
      );
    case "rs":
      return <IconImage src={rustIcon} alt={fileName} className={className} size={size} />;
    case "ts":
    case "tsx":
      return (
        <IconImage src={typescriptIcon} alt={fileName} className={className} size={size} />
      );
    case "js":
    case "jsx":
    case "mjs":
    case "cjs":
      return (
        <IconImage src={javascriptIcon} alt={fileName} className={className} size={size} />
      );
    case "json":
      return <IconImage src={jsonIcon} alt={fileName} className={className} size={size} />;
    case "yaml":
    case "yml":
      return <IconImage src={yamlIcon} alt={fileName} className={className} size={size} />;
    case "toml":
      return <IconImage src={tomlIcon} alt={fileName} className={className} size={size} />;
    case "md":
    case "mdx":
      return <IconImage src={markdownIcon} alt={fileName} className={className} size={size} />;
    case "py":
      return <IconImage src={pythonIcon} alt={fileName} className={className} size={size} />;
    case "cpp":
    case "cc":
    case "cxx":
    case "c":
    case "h":
    case "hpp":
      return <IconImage src={cppIcon} alt={fileName} className={className} size={size} />;
    case "conf":
    case "ini":
    case "env":
      return <IconImage src={configIcon} alt={fileName} className={className} size={size} />;
    default:
      return <IconImage src={fileIcon} alt={fileName} className={className} size={size} />;
  }
};

export const FolderIconComponent = ({
  isOpen,
  className = "",
  size = 16,
}: {
  isOpen: boolean;
  className?: string;
  size?: number;
}) => {
  return (
    <IconImage
      src={isOpen ? folderOpenIcon : folderIcon}
      alt={isOpen ? "folder open" : "folder"}
      className={className}
      size={size}
    />
  );
};

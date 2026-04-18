type IconProps = {
  className?: string;
  size?: number;
};

const FolderIcon = ({ className = "", size = 16 }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
    <path d="M10 4H4C2.9 4 2 4.9 2 6V18C2 19.1 2.9 20 4 20H20C21.1 20 22 19.1 22 18V8C22 6.9 21.1 6 20 6H12L10 4Z" fill="var(--blue)" />
    <path d="M22 8V18C22 19.1 21.1 20 20 20H4C2.9 20 2 19.1 2 18V10C2 8.9 2.9 8 4 8H22Z" fill="var(--blue)" fillOpacity="0.8" />
  </svg>
);

const FolderOpenIcon = ({ className = "", size = 16 }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
    <path d="M4 20H20C21.1 20 22 19.1 22 18V10C22 8.9 21.1 8 20 8H12L10 6H4C2.9 6 2 6.9 2 8V18C2 19.1 2.9 20 4 20Z" fill="var(--blue)" fillOpacity="0.6" />
    <path d="M2 10V18C2 19.1 2.9 20 4 20H20C21.1 20 22 19.1 22 18V12C22 10.9 21.1 10 20 10H2Z" fill="var(--blue)" />
  </svg>
);

const GoIcon = ({ className = "", size = 16 }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
    <path d="M2 12C2 6.477 6.477 2 12 2s10 4.477 10 10-4.477 10-10 10S2 17.523 2 12zm8.5-5.5v9l7-4.5-7-4.5z" fill="var(--sky)" className="hidden" />
    <path d="M1.986 11.233c.097-3.134 2.115-5.912 5.034-7.018 2.955-1.12 6.307-.484 8.647 1.48C17.7 7.4 18.5 10.1 18 12.8c-.5 2.7-2.3 4.9-4.8 5.8-2.5.9-5.3.4-7.4-1.2-1.9-1.5-3-3.9-2.8-6.17zm11.233 4.433c2.033-.6 3.5-2.4 3.9-4.5.4-2-.2-4.1-1.6-5.6-1.4-1.4-3.5-2-5.5-1.5-2 .5-3.6 2-4.3 4-1 2.8.2 6.1 3 7.8 1.4.9 3.1 1.1 4.5.8l.1-.1v.1z" fill="var(--sky)" />
    <path d="M12.5 10.5h4v1h-4v-1zm0 2.5h2v1h-2v-1z" fill="var(--sky)" />
  </svg>
);

const RustIcon = ({ className = "", size = 16 }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
    <circle cx="12" cy="12" r="9" stroke="var(--peach)" strokeWidth="2" />
    <path d="M12 7V17M7 12H17" stroke="var(--peach)" strokeWidth="2" strokeLinecap="round" />
    <path d="M8.5 8.5L15.5 15.5M15.5 8.5L8.5 15.5" stroke="var(--peach)" strokeWidth="2" strokeLinecap="round" />
  </svg>
);

const TSIcon = ({ className = "", size = 16 }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
    <rect width="24" height="24" rx="3" fill="var(--blue)" />
    <path d="M7 8h5v1.2H9.6v6H8.4v-6H7V8zm6.5 1.2h1.2V14c0 .8.5 1.2 1.2 1.2.6 0 1.1-.4 1.1-1.1v-4.9h1.2v5c0 1.4-1 2.2-2.3 2.2s-2.4-.8-2.4-2.2V9.2z" fill="var(--crust)" />
  </svg>
);

const JSONIcon = ({ className = "", size = 16 }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
    <path d="M14 2H6C4.9 2 4 2.9 4 4V20C4 21.1 4.9 22 6 22H18C19.1 22 20 21.1 20 20V8L14 2Z" fill="var(--yellow)" fillOpacity="0.2" />
    <path d="M11 11.5c0-.8-.7-1.5-1.5-1.5H8v5h1.5c.8 0 1.5-.7 1.5-1.5v-2zm2 0c0-.8.7-1.5 1.5-1.5h1.5v5h-1.5c-.8 0-1.5-.7-1.5-1.5v-2z" fill="var(--yellow)" />
  </svg>
);

const MDIcon = ({ className = "", size = 16 }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
    <path d="M21 5H3C1.9 5 1 5.9 1 7V17C1 18.1 1.9 19 3 19H21C22.1 19 23 18.1 23 17V7C23 5.9 22.1 5 21 5ZM21 17H3V7H21V17ZM17 14L19 11H15V14H17ZM5 9H7V15H5V9ZM10 9H12L13 11L14 9H16V15H14V12L13 14L12 12V15H10V9Z" fill="var(--overlay2)" />
  </svg>
);

const DefaultFileIcon = ({ className = "", size = 16 }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
    <path d="M14 2H6C4.9 2 4 2.9 4 4V20C4 21.1 4.9 22 6 22H18C19.1 22 20 21.1 20 20V8L14 2ZM13 9V3.5L18.5 9H13Z" fill="var(--overlay2)" fillOpacity="0.4" />
    <rect x="6" y="12" width="12" height="1.5" rx="0.75" fill="var(--overlay2)" fillOpacity="0.4" />
    <rect x="6" y="15" width="12" height="1.5" rx="0.75" fill="var(--overlay2)" fillOpacity="0.4" />
    <rect x="6" y="18" width="8" height="1.5" rx="0.75" fill="var(--overlay2)" fillOpacity="0.4" />
  </svg>
);

export const FileIcon = ({ fileName, className = "", size = 16 }: { fileName: string; className?: string; size?: number }) => {
  const parts = fileName.split(".");
  const ext = parts.pop()?.toLowerCase();
  
  if (fileName === "Cargo.toml") return <RustIcon className={className} size={size} />;
  if (fileName.includes("package.json")) return <JSONIcon className={className} size={size} />;
  if (fileName === "go.mod" || fileName === "go.sum") return <GoIcon className={className} size={size} />;
  
  switch (ext) {
    case "go":
      return <GoIcon className={className} size={size} />;
    case "rs":
      return <RustIcon className={className} size={size} />;
    case "ts":
    case "tsx":
      return <TSIcon className={className} size={size} />;
    case "json":
      return <JSONIcon className={className} size={size} />;
    case "md":
      return <MDIcon className={className} size={size} />;
    case "yaml":
    case "yml":
      return <JSONIcon className={className} size={size} />;
    default:
      return <DefaultFileIcon className={className} size={size} />;
  }
};

export const FolderIconComponent = ({ isOpen, className = "", size = 16 }: { isOpen: boolean; className?: string; size?: number }) => {
  return isOpen ? <FolderOpenIcon className={className} size={size} /> : <FolderIcon className={className} size={size} />;
};

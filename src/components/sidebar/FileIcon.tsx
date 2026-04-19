type IconProps = {
  className?: string;
  size?: number;
};

const FolderIcon = ({ className = "", size = 16 }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className={className} aria-hidden="true">
    <path d="M3 7.5C3 6.4 3.9 5.5 5 5.5H9.2C9.7 5.5 10.2 5.7 10.6 6.1L12.1 7.6H19C20.1 7.6 21 8.5 21 9.6V17.5C21 18.6 20.1 19.5 19 19.5H5C3.9 19.5 3 18.6 3 17.5V7.5Z" fill="var(--surface1)" />
    <path d="M4.5 9C4.5 8.2 5.2 7.5 6 7.5H10.1L11.8 9.2C12.1 9.5 12.6 9.7 13 9.7H19.5V17.1C19.5 17.6 19.1 18 18.6 18H5.4C4.9 18 4.5 17.6 4.5 17.1V9Z" fill="var(--blue)" fillOpacity="0.88" />
    <path d="M5.3 10.5H18.7C19.4 10.5 20 11.1 20 11.8V17.2C20 17.9 19.4 18.5 18.7 18.5H5.3C4.6 18.5 4 17.9 4 17.2V11.8C4 11.1 4.6 10.5 5.3 10.5Z" fill="var(--sky)" fillOpacity="0.72" />
    <path d="M5.2 11.5H18.8" stroke="rgba(205,214,244,0.45)" strokeLinecap="round" />
  </svg>
);

const FolderOpenIcon = ({ className = "", size = 16 }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className={className} aria-hidden="true">
    <path d="M3 7.5C3 6.4 3.9 5.5 5 5.5H9.1C9.6 5.5 10.1 5.7 10.5 6.1L12 7.6H19C20.1 7.6 21 8.5 21 9.6V11.2H3V7.5Z" fill="var(--surface1)" />
    <path d="M4.3 9.1C4.3 8.3 5 7.6 5.8 7.6H10L11.7 9.3C12.1 9.7 12.5 9.9 13.1 9.9H19.7V12H4.3V9.1Z" fill="var(--blue)" fillOpacity="0.86" />
    <path d="M4.8 10.8H20.3C21.3 10.8 22 11.8 21.7 12.8L20.4 17.5C20.1 18.4 19.3 19 18.4 19H5.2C4.3 19 3.5 18.4 3.2 17.5L2.2 13.9C1.8 12.4 3 10.8 4.8 10.8Z" fill="var(--sky)" fillOpacity="0.82" />
    <path d="M5.5 12.3H19.2" stroke="rgba(205,214,244,0.55)" strokeLinecap="round" />
    <path d="M5.1 17.4H18.4" stroke="rgba(17,24,39,0.24)" strokeLinecap="round" />
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

/**
 * DiscoveryOptions defines filtering and transformation parameters for file scanning.
 */
export interface DiscoveryOptions {
  /**
   * extension specifies the file extension to include (e.g., ".ts").
   * @default ".ts"
   */
  extension?: string;

  /**
   * includeFiles determines if regular files should be scanned.
   * @default true
   */
  includeFiles?: boolean;

  /**
   * includeDirectories determines if directories should be scanned.
   * @default false
   */
  includeDirectories?: boolean;

  /**
   * requiredFile specifies a filename that MUST exist within a directory for it to be included.
   * Only applicable when includeDirectories is true.
   */
  requiredFile?: string;
}

/**
 * discoverModules scans a directory and returns a sorted list of entry names
 * (stripping extensions if they are files).
 *
 * @param directoryUrl The URL of the directory to scan.
 * @param options Filtering options.
 * @returns A sorted array of module/entry names.
 */
export async function discoverModules(
  directoryUrl: URL,
  options: DiscoveryOptions = {},
): Promise<string[]> {
  const extension = options.extension ?? ".ts";
  const includeFiles = options.includeFiles ?? true;
  const includeDirectories = options.includeDirectories ?? false;
  const requiredFile = options.requiredFile;

  const names: string[] = [];
  for await (const entry of Deno.readDir(directoryUrl)) {
    if (includeFiles && entry.isFile && entry.name.endsWith(extension)) {
      names.push(entry.name.slice(0, -extension.length));
    } else if (includeDirectories && entry.isDirectory) {
      if (requiredFile) {
        try {
          const fileUrl = new URL(
            `./${entry.name}/${requiredFile}`,
            directoryUrl,
          );
          await Deno.stat(fileUrl);
          names.push(entry.name);
        } catch {
          // Skip directory if required file is missing
        }
      } else {
        names.push(entry.name);
      }
    }
  }
  return names.sort();
}

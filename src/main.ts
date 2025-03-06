interface Arguments {
  accessToken?: string;
  baseUrl: string;
  disableTelemetry: boolean;
  outputPath: string | undefined;
  owner: string;
  ownerType: OwnerType;
  proxyUrl: string | undefined;
  skipArchived: boolean;
  skipUpdateCheck: boolean;
  verbose: boolean;
  appId?: string | undefined;
  privateKey?: string | undefined;
  appInstallationId?: string | undefined;
}

enum OwnerType {
  Organization = 'organization',
  User = 'user',
}

export async function run(opts: Arguments): Promise<void> {
  console.log('Hello, TypeScript!');
}

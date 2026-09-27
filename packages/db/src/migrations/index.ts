import { initStatements } from './0001_init';

export interface Migration {
  version: number;
  statements: string[];
}

/** Ordered schema migrations. Never edit a shipped migration; append a new version instead. */
export const migrations: Migration[] = [{ version: 1, statements: initStatements }];

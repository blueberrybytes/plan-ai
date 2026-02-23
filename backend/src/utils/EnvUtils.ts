import dotenv from "dotenv";

dotenv.config();

class EnvUtils {
  /**
   * Get a specific environment variable by key.
   * @param key - The key of the environment variable.
   * @returns The value of the environment variable.
   * @throws Error if the variable is not defined.
   */
  static get<K extends keyof NodeJS.ProcessEnv>(key: K, defaultValue?: string): string {
    const value = process.env[key];
    if (!value && defaultValue === undefined) {
      throw new Error(`Environment variable ${key} is not defined.`);
    }
    return value || defaultValue || "";
  }

  /**
   * Get all environment variables as an object.
   * Automatically checks for all keys defined in `ProcessEnv`.
   * @returns An object containing all environment variables.
   * @throws Error if any required variable is not defined.
   */
  static getAll(): NodeJS.ProcessEnv {
    const env: Partial<NodeJS.ProcessEnv> = {};
    for (const key in process.env) {
      env[key as keyof NodeJS.ProcessEnv] = this.get(key as keyof NodeJS.ProcessEnv);
    }
    return env as NodeJS.ProcessEnv;
  }
}

export default EnvUtils;

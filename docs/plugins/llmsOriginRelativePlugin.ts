/**
 * Copyright (c) 2026, WSO2 LLC. (https://www.wso2.com).
 *
 * WSO2 LLC. licenses this file to you under the Apache License,
 * Version 2.0 (the "License"); you may not use this file except
 * in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing,
 * software distributed under the License is distributed on an
 * "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
 * KIND, either express or implied. See the License for the
 * specific language governing permissions and limitations
 * under the License.
 */

import {access, readFile, writeFile} from 'fs/promises';
import {join} from 'path';
import {setTimeout as sleep} from 'timers/promises';
import type {Plugin} from '@docusaurus/types';

const llmsFiles = ['llms.txt', 'llms-full.txt'];
const llmsGenerationTimeoutMs = 30000;
const llmsGenerationPollIntervalMs = 100;

const isMissingFileError = (error: unknown): boolean => {
  if (typeof error !== 'object' || error === null || !('code' in error)) {
    return false;
  }

  return (error as {code?: unknown}).code === 'ENOENT';
};

const normalizeBaseUrl = (baseUrl: string | undefined): string => {
  if (!baseUrl || baseUrl === '/') {
    return '/';
  }

  const withLeadingSlash = baseUrl.startsWith('/') ? baseUrl : `/${baseUrl}`;

  return withLeadingSlash.endsWith('/') ? withLeadingSlash : `${withLeadingSlash}/`;
};

const waitForFile = async (filePath: string): Promise<boolean> => {
  const deadline = Date.now() + llmsGenerationTimeoutMs;

  while (Date.now() < deadline) {
    try {
      await access(filePath);

      return true;
    } catch (error) {
      if (!isMissingFileError(error)) {
        throw error;
      }

      await sleep(llmsGenerationPollIntervalMs);
    }
  }

  return false;
};

// TODO: Remove this plugin once both of the following are resolved:
// 1. docusaurus-plugin-llms adds native support for origin-relative URL generation
//    (tracked at https://github.com/rachfop/docusaurus-plugin-llms/issues/42).
// 2. Docusaurus supports subpaths in the `url` config field, allowing the real
//    deployment URL (GitHub Pages) to be set instead of the current placeholder.
//    Until then, absolute URLs baked into llms.txt by the plugin would point to the
//    wrong host, so this plugin rewrites them to origin-relative paths at build time.
export default function llmsOriginRelativePlugin(): Plugin {
  return {
    name: 'thunder-llms-origin-relative-plugin',

    async postBuild({siteConfig, outDir}) {
      const baseUrl = normalizeBaseUrl(siteConfig.baseUrl);
      const absoluteBaseUrl = `${siteConfig.url.replace(/\/$/, '')}${baseUrl}`;
      const llmsTxtPath = join(outDir, 'llms.txt');

      if (!(await waitForFile(llmsTxtPath))) {
        return;
      }

      for (const file of llmsFiles) {
        const filePath = join(outDir, file);

        try {
          const content = await readFile(filePath, 'utf8');
          const nextContent = content.replaceAll(absoluteBaseUrl, baseUrl);

          if (nextContent !== content) {
            await writeFile(filePath, nextContent);
          }
        } catch (error) {
          if (isMissingFileError(error)) {
            continue;
          }

          throw error;
        }
      }
    },
  };
}

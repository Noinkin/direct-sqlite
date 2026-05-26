// @ts-check
import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';
import fs from 'node:fs';
import path from 'node:path';

const sidebarFilePath = path.resolve('./src/api-sidebar.json');
const apiSidebarItems = fs.existsSync(sidebarFilePath)
  ? JSON.parse(fs.readFileSync(sidebarFilePath, 'utf-8'))
  : [];

// https://astro.build/config
export default defineConfig({
    site: 'https://noinkin.github.io',
    base: '/direct-sqlite',
	integrations: [
		starlight({
			title: 'direct-sqlite',
			social: [{ icon: 'github', label: 'GitHub', href: 'https://github.com/noinkin/direct-sqlite' }],
			sidebar: [
				{
					label: 'Guides',
					items: [
						// Each item here is one entry in the navigation menu.
						{ label: 'Getting Started', slug: 'guides/getting-started' },
						{ label: 'Database Configuration', slug: 'guides/configuration' },
						{ label: 'Query & Mutation Builders', slug: 'guides/queries-and-mutations' },
					],
				},
				{
					label: 'API Reference',
					items: [
                        { label: 'Overview', slug: 'api' },
                        ...apiSidebarItems
                    ]
				},
			],
		}),
	],
});
 
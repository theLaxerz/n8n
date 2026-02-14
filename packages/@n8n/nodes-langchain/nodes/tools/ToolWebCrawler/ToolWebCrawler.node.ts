import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';
import type {
	INodeType,
	INodeTypeDescription,
	ISupplyDataFunctions,
	SupplyData,
	IHttpRequestOptions,
} from 'n8n-workflow';
import { NodeConnectionTypes } from 'n8n-workflow';
import * as cheerio from 'cheerio';
import { URL } from 'url';
import { SocksProxyAgent } from 'socks-proxy-agent';

export class ToolWebCrawler implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Web Crawler',
		name: 'toolWebCrawler',
		icon: 'fa:spider',
		group: ['output'],
		version: 1,
		description: 'Crawls a web page and extracts text content with optional recursion',
		defaults: {
			name: 'Web Crawler',
		},
		codex: {
			categories: ['AI'],
			subcategories: {
				AI: ['Tools'],
				Tools: ['Recommended Tools'],
			},
		},
		inputs: [],
		outputs: [NodeConnectionTypes.AiTool],
		outputNames: ['Tool'],
		properties: [
			{
				displayName: 'Proxy URL',
				name: 'proxy',
				type: 'string',
				default: '',
				placeholder: 'e.g. socks5://127.0.0.1:9050',
				description: 'Optional proxy URL (e.g. for accessing dark web)',
			},
            {
                displayName: 'Max Pages per Crawl',
                name: 'maxPages',
                type: 'number',
                default: 5,
                description: 'Maximum number of pages to crawl in one execution to prevent timeouts',
            },
		],
	};

	async supplyData(this: ISupplyDataFunctions, itemIndex: number): Promise<SupplyData> {
		const proxy = this.getNodeParameter('proxy', itemIndex, '') as string;
        const maxPages = this.getNodeParameter('maxPages', itemIndex, 5) as number;

		const tool = new DynamicStructuredTool({
			name: 'web_crawler',
			description: 'Crawls a web page and recursively follows links to extract text content. Use depth > 0 to follow links.',
			schema: z.object({
				url: z.string().describe('The starting URL to crawl'),
                depth: z.number().optional().describe('Depth of recursion (0 for single page, 1 for links on page, etc.)'),
			}),
			func: async ({ url, depth = 0 }) => {
                const visited = new Set<string>();
                const queue: { url: string; depth: number }[] = [{ url, depth: 0 }];
                const results: string[] = [];
                let count = 0;

                // Breadth-First Search
                while (queue.length > 0 && count < maxPages) {
                    const current = queue.shift()!;
                    if (visited.has(current.url)) continue;
                    visited.add(current.url);
                    count++;

                    try {
                        // Cast options to include agent properties which axios supports but interface might hide
                        const options: IHttpRequestOptions & { httpsAgent?: any; httpAgent?: any } = {
                            method: 'GET',
                            url: current.url,
                            returnFullResponse: true,
                            headers: {
                                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
                            },
                        };

                        if (proxy) {
                            try {
                                const proxyUrl = new URL(proxy);
                                if (proxyUrl.protocol.startsWith('socks')) {
                                    const agent = new SocksProxyAgent(proxy);
                                    options.httpsAgent = agent;
                                    options.httpAgent = agent;
                                } else {
                                    options.proxy = {
                                        host: proxyUrl.hostname,
                                        port: parseInt(proxyUrl.port, 10),
                                        protocol: proxyUrl.protocol.replace(':', '') as 'http' | 'https',
                                    };
                                }
                            } catch (e) {
                                // Ignore invalid proxy
                            }
                        }

                        const response = await this.helpers.httpRequest(options);

                        const body = response.body;
                        let html = '';
                        if (Buffer.isBuffer(body)) {
                            html = body.toString('utf-8');
                        } else if (typeof body === 'string') {
                            html = body;
                        } else if (typeof body === 'object') {
                            html = JSON.stringify(body);
                        }

                        const $ = cheerio.load(html);

                        // Remove clutter
                        $('script, style, nav, footer, header, noscript, iframe').remove();

                        const text = $('body').text().replace(/\s+/g, ' ').trim();
                        results.push(`URL: ${current.url}\nContent: ${text.slice(0, 10000)}`);

                        // Extract links if we haven't reached depth limit
                        if (current.depth < depth) {
                            $('a[href]').each((_, el) => {
                                const link = $(el).attr('href');
                                if (link) {
                                    try {
                                        const absoluteUrl = new URL(link, current.url).href;
                                        if (absoluteUrl.startsWith('http') && !visited.has(absoluteUrl)) {
                                            queue.push({ url: absoluteUrl, depth: current.depth + 1 });
                                        }
                                    } catch (e) {
                                        // Invalid URL
                                    }
                                }
                            });
                        }

                    } catch (error: any) {
                        results.push(`URL: ${current.url}\nError: ${error.message}`);
                    }
                }

                if (results.length === 0) return "No content found or error occurred.";
                return results.join('\n\n---\n\n');
			},
		});

		return {
			response: tool,
		};
	}
}

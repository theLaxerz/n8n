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

export class ToolWebCrawler implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Web Crawler',
		name: 'toolWebCrawler',
		icon: 'fa:spider',
		group: ['output'],
		version: 1,
		description: 'Crawls a web page and extracts text content',
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
				placeholder: 'e.g. http://127.0.0.1:9050',
				description: 'Optional proxy URL (e.g. for accessing dark web)',
			},
		],
	};

	async supplyData(this: ISupplyDataFunctions, itemIndex: number): Promise<SupplyData> {
		const proxy = this.getNodeParameter('proxy', itemIndex, '') as string;

		const tool = new DynamicStructuredTool({
			name: 'web_crawler',
			description: 'Crawls a web page and returns the text content. Pass the URL to crawl.',
			schema: z.object({
				url: z.string().describe('The URL to crawl'),
			}),
			func: async ({ url }) => {
				try {
					const options: IHttpRequestOptions = {
						method: 'GET',
						url: url,
						returnFullResponse: true,
                        // Basic headers to look like a browser
                        headers: {
                            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
                        }
					};

					if (proxy) {
						try {
							const proxyUrl = new URL(proxy);
							options.proxy = {
								host: proxyUrl.hostname,
								port: parseInt(proxyUrl.port, 10),
								protocol: proxyUrl.protocol.replace(':', '') as 'http' | 'https',
							};
                            // Note: axios proxy support in n8n might vary depending on version/config,
                            // but IHttpRequestOptions has proxy field.
						} catch (e) {
							return `Invalid proxy URL: ${proxy}`;
						}
					}

					const response = await this.helpers.httpRequest(options);

                    // Handle buffer or text
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
					$('script').remove();
					$('style').remove();
					$('nav').remove();
					$('footer').remove();
                    $('header').remove();

					const text = $('body').text().replace(/\s+/g, ' ').trim();
					return text.slice(0, 50000); // Limit to 50k chars
				} catch (error: any) {
					return `Error crawling ${url}: ${error.message}`;
				}
			},
		});

		return {
			response: tool,
		};
	}
}

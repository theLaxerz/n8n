import { ToolWebCrawler } from './ToolWebCrawler.node';
import { mock } from 'jest-mock-extended';
import { ISupplyDataFunctions } from 'n8n-workflow';

describe('ToolWebCrawler', () => {
	it('should be defined', () => {
		const node = new ToolWebCrawler();
		expect(node).toBeDefined();
	});

	it('should supply tool', async () => {
		const node = new ToolWebCrawler();
		const mockSupplyDataFunctions = mock<ISupplyDataFunctions>();
		mockSupplyDataFunctions.getNodeParameter.calledWith('proxy', 0, '').mockReturnValue('');
        mockSupplyDataFunctions.getNodeParameter.calledWith('maxPages', 0, 5).mockReturnValue(5);

		const result = await node.supplyData.call(mockSupplyDataFunctions, 0);
		expect(result.response).toBeDefined();
		expect(result.response.name).toBe('web_crawler');
	});
});

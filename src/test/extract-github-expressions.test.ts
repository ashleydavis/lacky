import { extractGitHubExpressions } from '../lib/resolve-variable';

describe('extractGitHubExpressions', () => {
    it('should extract single GitHub expression', () => {
        const text = 'Hello ${{ github.ref_name }} world';
        const result = extractGitHubExpressions(text);
        expect(result).toEqual(['github.ref_name']);
    });

    it('should extract multiple GitHub expressions', () => {
        const text = 'Branch: ${{ github.ref_name }}, SHA: ${{ github.sha }}, Workspace: ${{ github.workspace }}';
        const result = extractGitHubExpressions(text);
        expect(result).toEqual(['github.ref_name', 'github.sha', 'github.workspace']);
    });

    it('should handle expressions with extra whitespace', () => {
        const text = 'Hello ${{  github.ref_name  }} world';
        const result = extractGitHubExpressions(text);
        expect(result).toEqual(['github.ref_name']);
    });

    it('should handle expressions with different whitespace patterns', () => {
        const text = 'Test ${{github.ref_name}} and ${{  env.VAR  }} and ${{github.event.inputs.name}}';
        const result = extractGitHubExpressions(text);
        expect(result).toEqual(['github.ref_name', 'env.VAR', 'github.event.inputs.name']);
    });

    it('should return empty array when no expressions found', () => {
        const text = 'This is just plain text with no expressions';
        const result = extractGitHubExpressions(text);
        expect(result).toEqual([]);
    });

    it('should handle empty string', () => {
        const text = '';
        const result = extractGitHubExpressions(text);
        expect(result).toEqual([]);
    });

    it('should handle malformed expressions', () => {
        const text = 'Test ${{ incomplete and ${{ github.ref_name }} and ${{ also incomplete';
        const result = extractGitHubExpressions(text);
        expect(result).toEqual(['incomplete and ${{ github.ref_name']);
    });

    it('should handle nested expressions', () => {
        const text = 'Test ${{ github.event.inputs.terraform_version }} and ${{ env.TF_VAR_region }}';
        const result = extractGitHubExpressions(text);
        expect(result).toEqual(['github.event.inputs.terraform_version', 'env.TF_VAR_region']);
    });

    it('should handle expressions with special characters', () => {
        const text = 'Test ${{ github.event.inputs.region }} and ${{ env.TF_VAR_environment }}';
        const result = extractGitHubExpressions(text);
        expect(result).toEqual(['github.event.inputs.region', 'env.TF_VAR_environment']);
    });

    it('should handle duplicate expressions', () => {
        const text = 'Test ${{ github.ref_name }} and ${{ github.ref_name }} again';
        const result = extractGitHubExpressions(text);
        expect(result).toEqual(['github.ref_name', 'github.ref_name']);
    });
});

interface Input extends Record<string, any> {
    __views: string;
}
export declare function phpRenderToHtml(filename: string, input: Input): Promise<string>;
export {};

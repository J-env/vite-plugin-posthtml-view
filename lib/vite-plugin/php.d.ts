interface Input extends Record<string, any> {
    __views: string;
}
export declare function phpRenderToHtml(filename: string, args: string[] | undefined, input: Input): Promise<string>;
export {};

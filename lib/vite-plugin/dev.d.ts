export declare function requireMock(jspath: string, originalUrl: string, hot?: boolean): Promise<Record<string, any>>;
export declare function writeTemplate(html: string, root: string, cacheDirectory: string, file: string): Promise<{
    tplFileName: string;
    __views: string;
}>;

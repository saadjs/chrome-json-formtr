export interface Theme {
    name: string;
    id: string;
    colors: {
        background: string;
        foreground: string;
        lineNumberColor: string;
        lineNumberBackground: string;
        jsonKey: string;
        jsonString: string;
        jsonNumber: string;
        jsonBoolean: string;
        jsonNull: string;
        jsonBrace: string;
    };
}

export const themes: Record<string, Theme> = {
    dark: {
        name: 'One Dark',
        id: 'dark',
        colors: {
            background: '#1e1e1e',
            foreground: '#d4d4d4',
            lineNumberColor: '#858585',
            lineNumberBackground: '#252526',
            jsonKey: '#9cdcfe',
            jsonString: '#ce9178',
            jsonNumber: '#b5cea8',
            jsonBoolean: '#569cd6',
            jsonNull: '#569cd6',
            jsonBrace: '#d4d4d4'
        }
    },
    light: {
        name: 'One Light',
        id: 'light',
        colors: {
            background: '#fafafa',
            foreground: '#383a42',
            lineNumberColor: '#a0a1a7',
            lineNumberBackground: '#f0f0f1',
            jsonKey: '#e45649',
            jsonString: '#50a14f',
            jsonNumber: '#986801',
            jsonBoolean: '#4078f2',
            jsonNull: '#4078f2',
            jsonBrace: '#383a42'
        }
    }
};

export function getTheme(themeId: string): Theme {
    return themes[themeId] || themes.dark;
}

export function generateThemeCSS(theme: Theme, fontSize: number): string {
    return `
        html {
            --bg: ${theme.colors.background};
            --fg: ${theme.colors.foreground};
            --line-number-color: ${theme.colors.lineNumberColor};
            --line-number-bg: ${theme.colors.lineNumberBackground};
            --json-key: ${theme.colors.jsonKey};
            --json-string: ${theme.colors.jsonString};
            --json-number: ${theme.colors.jsonNumber};
            --json-boolean: ${theme.colors.jsonBoolean};
            --json-null: ${theme.colors.jsonNull};
            --json-brace: ${theme.colors.jsonBrace};
            background: ${theme.colors.background};
        }
        
        body {
            background: ${theme.colors.background};
            color: ${theme.colors.foreground};
        }
        
        #json-format-viewer {
            --bg: ${theme.colors.background};
            --fg: ${theme.colors.foreground};
            --line-number-color: ${theme.colors.lineNumberColor};
            --line-number-bg: ${theme.colors.lineNumberBackground};
            --json-key: ${theme.colors.jsonKey};
            --json-string: ${theme.colors.jsonString};
            --json-number: ${theme.colors.jsonNumber};
            --json-boolean: ${theme.colors.jsonBoolean};
            --json-null: ${theme.colors.jsonNull};
            --json-brace: ${theme.colors.jsonBrace};
            font-size: ${fontSize}px;
            background: ${theme.colors.background};
            color: ${theme.colors.foreground};
        }
        
        .json-key { color: var(--json-key); }
        .json-string { color: var(--json-string); }
        .json-number { color: var(--json-number); }
        .json-boolean { color: var(--json-boolean); }
        .json-null { color: var(--json-null); }
        .json-brace { color: var(--json-brace); }
    `;
}

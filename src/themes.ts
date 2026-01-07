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
    },
    solarizedDark: {
        name: 'Solarized Dark',
        id: 'solarizedDark',
        colors: {
            background: '#002b36',
            foreground: '#839496',
            lineNumberColor: '#586e75',
            lineNumberBackground: '#073642',
            jsonKey: '#268bd2',
            jsonString: '#2aa198',
            jsonNumber: '#d33682',
            jsonBoolean: '#cb4b16',
            jsonNull: '#6c71c4',
            jsonBrace: '#93a1a1'
        }
    },
    solarizedLight: {
        name: 'Solarized Light',
        id: 'solarizedLight',
        colors: {
            background: '#fdf6e3',
            foreground: '#657b83',
            lineNumberColor: '#93a1a1',
            lineNumberBackground: '#eee8d5',
            jsonKey: '#268bd2',
            jsonString: '#2aa198',
            jsonNumber: '#d33682',
            jsonBoolean: '#cb4b16',
            jsonNull: '#6c71c4',
            jsonBrace: '#586e75'
        }
    },
    monokai: {
        name: 'Monokai',
        id: 'monokai',
        colors: {
            background: '#272822',
            foreground: '#f8f8f2',
            lineNumberColor: '#90908a',
            lineNumberBackground: '#3e3d32',
            jsonKey: '#f92672',
            jsonString: '#e6db74',
            jsonNumber: '#ae81ff',
            jsonBoolean: '#66d9ef',
            jsonNull: '#66d9ef',
            jsonBrace: '#f8f8f2'
        }
    },
    nord: {
        name: 'Nord',
        id: 'nord',
        colors: {
            background: '#2e3440',
            foreground: '#d8dee9',
            lineNumberColor: '#4c566a',
            lineNumberBackground: '#3b4252',
            jsonKey: '#81a1c1',
            jsonString: '#a3be8c',
            jsonNumber: '#b48ead',
            jsonBoolean: '#81a1c1',
            jsonNull: '#81a1c1',
            jsonBrace: '#eceff4'
        }
    },
    dracula: {
        name: 'Dracula',
        id: 'dracula',
        colors: {
            background: '#282a36',
            foreground: '#f8f8f2',
            lineNumberColor: '#6272a4',
            lineNumberBackground: '#21222c',
            jsonKey: '#8be9fd',
            jsonString: '#f1fa8c',
            jsonNumber: '#bd93f9',
            jsonBoolean: '#ff79c6',
            jsonNull: '#ff79c6',
            jsonBrace: '#f8f8f2'
        }
    },
    githubDark: {
        name: 'GitHub Dark',
        id: 'githubDark',
        colors: {
            background: '#0d1117',
            foreground: '#c9d1d9',
            lineNumberColor: '#8b949e',
            lineNumberBackground: '#161b22',
            jsonKey: '#79c0ff',
            jsonString: '#a5d6ff',
            jsonNumber: '#79c0ff',
            jsonBoolean: '#ff7b72',
            jsonNull: '#ff7b72',
            jsonBrace: '#c9d1d9'
        }
    },
    githubLight: {
        name: 'GitHub Light',
        id: 'githubLight',
        colors: {
            background: '#ffffff',
            foreground: '#24292f',
            lineNumberColor: '#57606a',
            lineNumberBackground: '#f6f8fa',
            jsonKey: '#0550ae',
            jsonString: '#0a3069',
            jsonNumber: '#0550ae',
            jsonBoolean: '#cf222e',
            jsonNull: '#cf222e',
            jsonBrace: '#24292f'
        }
    },
    gruvboxDark: {
        name: 'Gruvbox Dark',
        id: 'gruvboxDark',
        colors: {
            background: '#282828',
            foreground: '#ebdbb2',
            lineNumberColor: '#928374',
            lineNumberBackground: '#3c3836',
            jsonKey: '#83a598',
            jsonString: '#b8bb26',
            jsonNumber: '#d3869b',
            jsonBoolean: '#fe8019',
            jsonNull: '#fe8019',
            jsonBrace: '#ebdbb2'
        }
    },
    nightOwl: {
        name: 'Night Owl',
        id: 'nightOwl',
        colors: {
            background: '#011627',
            foreground: '#d6deeb',
            lineNumberColor: '#5f7e97',
            lineNumberBackground: '#01111d',
            jsonKey: '#82aaff',
            jsonString: '#c3e88d',
            jsonNumber: '#f78c6c',
            jsonBoolean: '#c792ea',
            jsonNull: '#c792ea',
            jsonBrace: '#d6deeb'
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

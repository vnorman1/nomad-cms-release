<?xml version="1.0" encoding="UTF-8"?>
<xsl:stylesheet version="1.0" xmlns:xsl="http://www.w3.org/1999/XSL/Transform" xmlns:sitemap="http://www.sitemaps.org/schemas/sitemap/0.9">
    <xsl:output method="html" version="1.0" encoding="UTF-8" indent="yes"/>
    <xsl:template match="/">
        <html lang="en">
            <head>
                <title>NOMAD // SITEMAP</title>
                <meta name="viewport" content="width=device-width, initial-scale=1"/>
                <link rel="icon" type="image/webp" href="data:image/webp;base64,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"/>
                <style>
                    :root {
                        --background: #0a0a0a;
                        --foreground: #f5f5f5;
                        --border: #262626;
                        --muted: #404040;
                        --accent: #171717;
                    }
                    
                    * {
                        box-sizing: border-box;
                    }

                    body {
                        background-color: var(--background);
                        color: var(--foreground);
                        font-family: 'JetBrains Mono', 'Menlo', 'Monaco', 'Courier New', monospace;
                        margin: 0;
                        padding: 0;
                        font-size: 13px;
                        line-height: 1.5;
                        -webkit-font-smoothing: antialiased;
                    }

                    a {
                        color: inherit;
                        text-decoration: none;
                        border-bottom: 1px solid var(--muted);
                        transition: all 0.2s ease;
                    }

                    a:hover {
                        border-bottom-color: var(--foreground);
                        background-color: var(--accent);
                    }

                    .container {
                        max-width: 1200px;
                        margin: 0 auto;
                        padding: 40px 20px;
                    }

                    header {
                        margin-bottom: 60px;
                        border-bottom: 1px solid var(--border);
                        padding-bottom: 20px;
                        display: flex;
                        justify-content: space-between;
                        align-items: flex-end;
                    }

                    h1 {
                        font-size: 13px;
                        font-weight: 400;
                        margin: 0;
                        letter-spacing: 2px;
                        text-transform: uppercase;
                        opacity: 0.8;
                    }
                    
                    .meta {
                        font-size: 11px;
                        color: #888;
                        text-transform: uppercase;
                        letter-spacing: 1px;
                    }

                    table {
                        width: 100%;
                        border-collapse: collapse;
                        text-align: left;
                    }

                    th {
                        border-bottom: 1px solid var(--border);
                        padding: 12px 16px;
                        font-weight: 400;
                        text-transform: uppercase;
                        letter-spacing: 1px;
                        color: #888;
                        font-size: 11px;
                    }

                    td {
                        padding: 12px 16px;
                        border-bottom: 1px solid var(--accent);
                        color: var(--foreground);
                    }

                    tr:hover td {
                        background-color: var(--accent);
                    }
                    
                    /* Utility columns */
                    .col-url { width: 60%; }
                    .col-priority { width: 10%; text-align: right; }
                    .col-freq { width: 15%; text-align: right; }
                    .col-lastmod { width: 15%; text-align: right; }

                    /* Mobile styles */
                    @media (max-width: 768px) {
                        .container {
                            padding: 20px;
                        }

                        header {
                            flex-direction: column;
                            align-items: flex-start;
                            gap: 10px;
                            margin-bottom: 30px;
                        }

                        .meta {
                            margin-top: 5px;
                        }

                        .col-priority, .col-freq { 
                            display: none; 
                        }
                        
                        .col-url { 
                            width: 65%; 
                        }
                        
                        .col-lastmod { 
                            width: 35%; 
                        }

                        /* Force URL wrapping on mobile */
                        td.col-url a {
                            word-break: break-all;
                            font-size: 11px; /* Slightly smaller font for URLs on mobile */
                            display: block;
                            line-height: 1.4;
                        }
                    }
                </style>
            </head>
            <body>
                <div class="container">
                    <header>
                        <div>
                            <h1>NOMAD System // Sitemap</h1>
                        </div>
                        <div class="meta">
                            <xsl:value-of select="count(sitemap:urlset/sitemap:url)"/> NODES INDEXED
                        </div>
                    </header>
                    
                    <table>
                        <thead>
                            <tr>
                                <th class="col-url">Location</th>
                                <th class="col-priority">Priority</th>
                                <th class="col-freq">Change Freq</th>
                                <th class="col-lastmod">Last Modified</th>
                            </tr>
                        </thead>
                        <tbody>
                            <xsl:for-each select="sitemap:urlset/sitemap:url">
                                <xsl:sort select="sitemap:priority" order="descending"/>
                                <tr>
                                    <td class="col-url">
                                        <a href="{sitemap:loc}" target="_blank">
                                            <xsl:value-of select="sitemap:loc"/>
                                        </a>
                                    </td>
                                    <td class="col-priority">
                                        <xsl:value-of select="sitemap:priority"/>
                                    </td>
                                    <td class="col-freq">
                                        <xsl:value-of select="sitemap:changefreq"/>
                                    </td>
                                    <td class="col-lastmod">
                                        <xsl:value-of select="sitemap:lastmod"/>
                                    </td>
                                </tr>
                            </xsl:for-each>
                        </tbody>
                    </table>
                </div>
            </body>
        </html>
    </xsl:template>
</xsl:stylesheet>

<?php
/**
 * NOMAD CMS - SVG Sanitizer
 * 
 * Removes potentially dangerous elements from SVG files to prevent XSS attacks.
 * SVG files can contain embedded JavaScript in:
 * - <script> tags
 * - Event handlers (onclick, onerror, onload, etc.)
 * - javascript: protocol in xlink:href
 * - data: URLs with embedded scripts
 * - Foreign objects embedding HTML
 * - use elements referencing external resources
 * 
 * @security CRITICAL - This module prevents SVG-based XSS attacks
 */

declare(strict_types=1);

namespace NomadCMS\Security;

use DOMDocument;
use DOMElement;
use DOMXPath;

class SvgSanitizer
{
    /**
     * Dangerous elements that should be completely removed
     */
    private const DANGEROUS_ELEMENTS = [
        'script',           // JavaScript
        'foreignobject',    // Can embed HTML/scripts
        'set',              // Can be used for attacks
        'animate',          // Can trigger events - optionally remove
        'animatetransform', // Can trigger events
        'animatemotion',    // Can trigger events
    ];

    /**
     * Event handler attributes that should be removed
     */
    private const DANGEROUS_ATTRIBUTES = [
        // Mouse events
        'onclick', 'ondblclick', 'onmousedown', 'onmouseup', 'onmouseover',
        'onmousemove', 'onmouseout', 'onmouseenter', 'onmouseleave',
        // Keyboard events
        'onkeydown', 'onkeyup', 'onkeypress',
        // Focus events
        'onfocus', 'onblur', 'onfocusin', 'onfocusout',
        // Load events
        'onload', 'onunload', 'onabort', 'onerror', 'onresize',
        // Form events
        'onchange', 'oninput', 'onsubmit', 'onreset', 'oninvalid',
        // Animation/SVG events
        'onbegin', 'onend', 'onrepeat',
        // Other events
        'onscroll', 'onwheel', 'oncopy', 'oncut', 'onpaste',
        'ondrag', 'ondragend', 'ondragenter', 'ondragleave', 'ondragover',
        'ondragstart', 'ondrop',
        // CSS related
        'style', // Can contain expression() in older browsers
    ];

    /**
     * Attributes that can contain URLs and need validation
     */
    private const URL_ATTRIBUTES = [
        'href',
        'xlink:href',
        'src',
        'data',
    ];

    /**
     * Dangerous URL protocols
     */
    private const DANGEROUS_PROTOCOLS = [
        'javascript:',
        'data:text/html',
        'data:application/javascript',
        'vbscript:',
    ];

    /**
     * Sanitize an SVG string
     * 
     * @param string $svgContent Raw SVG content
     * @return string Sanitized SVG content
     * @throws \InvalidArgumentException If content is not valid SVG
     */
    public static function sanitize(string $svgContent): string
    {
        // Basic validation
        if (empty(trim($svgContent))) {
            throw new \InvalidArgumentException('Empty SVG content');
        }

        // Check if it looks like SVG
        if (!str_contains($svgContent, '<svg')) {
            throw new \InvalidArgumentException('Content does not appear to be SVG');
        }

        // Load as DOM
        $dom = new DOMDocument();
        
        // Suppress warnings for malformed XML, but track errors
        libxml_use_internal_errors(true);
        
        // Load XML preserving whitespace
        $loaded = $dom->loadXML($svgContent, LIBXML_NONET | LIBXML_NOBLANKS);
        
        $errors = libxml_get_errors();
        libxml_clear_errors();
        
        if (!$loaded) {
            $errorMessages = array_map(fn($e) => trim($e->message), $errors);
            throw new \InvalidArgumentException('Invalid SVG XML: ' . implode(', ', $errorMessages));
        }

        // Process the document
        self::removeDangerousElements($dom);
        self::removeDangerousAttributes($dom);
        self::sanitizeUrls($dom);
        self::removeExternalResources($dom);

        // Get sanitized output
        $sanitized = $dom->saveXML($dom->documentElement);
        
        if ($sanitized === false) {
            throw new \InvalidArgumentException('Failed to serialize sanitized SVG');
        }

        // Add XML declaration if not present
        if (!str_starts_with($sanitized, '<?xml')) {
            $sanitized = '<?xml version="1.0" encoding="UTF-8"?>' . "\n" . $sanitized;
        }

        return $sanitized;
    }

    /**
     * Sanitize an SVG file
     * 
     * @param string $inputPath Path to input SVG file
     * @param string|null $outputPath Path to output file (null = overwrite input)
     * @return bool Success status
     */
    public static function sanitizeFile(string $inputPath, ?string $outputPath = null): bool
    {
        if (!file_exists($inputPath)) {
            return false;
        }

        $content = file_get_contents($inputPath);
        if ($content === false) {
            return false;
        }

        try {
            $sanitized = self::sanitize($content);
            $targetPath = $outputPath ?? $inputPath;
            return file_put_contents($targetPath, $sanitized) !== false;
        } catch (\Exception) {
            return false;
        }
    }

    /**
     * Check if SVG content is safe (without sanitizing)
     * 
     * @param string $svgContent SVG content to check
     * @return array{safe: bool, issues: string[]} Safety check result
     */
    public static function check(string $svgContent): array
    {
        $issues = [];

        // Quick regex checks for common dangerous patterns
        if (preg_match('/<script[\s>]/i', $svgContent)) {
            $issues[] = 'Contains <script> element';
        }

        if (preg_match('/\bon\w+\s*=/i', $svgContent)) {
            $issues[] = 'Contains event handler attributes';
        }

        if (preg_match('/javascript\s*:/i', $svgContent)) {
            $issues[] = 'Contains javascript: protocol';
        }

        if (preg_match('/<foreignobject/i', $svgContent)) {
            $issues[] = 'Contains <foreignObject> element';
        }

        if (preg_match('/data\s*:\s*text\/html/i', $svgContent)) {
            $issues[] = 'Contains data:text/html URL';
        }

        if (preg_match('/xlink:href\s*=\s*["\']?\s*#/i', $svgContent)) {
            // Internal references are OK
        } elseif (preg_match('/xlink:href\s*=\s*["\']?\s*(http|\/)/i', $svgContent)) {
            $issues[] = 'Contains external xlink:href reference';
        }

        return [
            'safe' => empty($issues),
            'issues' => $issues,
        ];
    }

    /**
     * Remove dangerous elements from DOM
     */
    private static function removeDangerousElements(DOMDocument $dom): void
    {
        $xpath = new DOMXPath($dom);
        
        // Register SVG namespace
        $xpath->registerNamespace('svg', 'http://www.w3.org/2000/svg');

        foreach (self::DANGEROUS_ELEMENTS as $tagName) {
            // Find elements with and without namespace
            $elements = $xpath->query("//*[local-name()='$tagName']");
            
            if ($elements === false) {
                continue;
            }

            // Collect elements first to avoid modifying while iterating
            $toRemove = [];
            foreach ($elements as $element) {
                $toRemove[] = $element;
            }

            foreach ($toRemove as $element) {
                $element->parentNode?->removeChild($element);
            }
        }
    }

    /**
     * Remove dangerous attributes from all elements
     */
    private static function removeDangerousAttributes(DOMDocument $dom): void
    {
        $xpath = new DOMXPath($dom);
        $elements = $xpath->query('//*');

        if ($elements === false) {
            return;
        }

        foreach ($elements as $element) {
            if (!($element instanceof DOMElement)) {
                continue;
            }

            // Remove dangerous attributes
            foreach (self::DANGEROUS_ATTRIBUTES as $attr) {
                if ($element->hasAttribute($attr)) {
                    $element->removeAttribute($attr);
                }
            }

            // Check all attributes for event handlers (catch any on* we missed)
            $attributesToRemove = [];
            foreach ($element->attributes as $attr) {
                if (str_starts_with(strtolower($attr->name), 'on')) {
                    $attributesToRemove[] = $attr->name;
                }
            }
            
            foreach ($attributesToRemove as $attrName) {
                $element->removeAttribute($attrName);
            }
        }
    }

    /**
     * Sanitize URL attributes
     */
    private static function sanitizeUrls(DOMDocument $dom): void
    {
        $xpath = new DOMXPath($dom);
        $elements = $xpath->query('//*');

        if ($elements === false) {
            return;
        }

        foreach ($elements as $element) {
            if (!($element instanceof DOMElement)) {
                continue;
            }

            foreach (self::URL_ATTRIBUTES as $attr) {
                // Handle namespaced attributes
                $value = null;
                
                if ($attr === 'xlink:href') {
                    $value = $element->getAttributeNS('http://www.w3.org/1999/xlink', 'href');
                    $attrKey = 'xlink:href';
                } elseif ($element->hasAttribute($attr)) {
                    $value = $element->getAttribute($attr);
                    $attrKey = $attr;
                }

                if ($value === null || $value === '') {
                    continue;
                }

                // Check for dangerous protocols
                $lowerValue = strtolower(trim($value));
                
                foreach (self::DANGEROUS_PROTOCOLS as $protocol) {
                    if (str_starts_with($lowerValue, $protocol)) {
                        // Remove dangerous URL
                        if ($attr === 'xlink:href') {
                            $element->removeAttributeNS('http://www.w3.org/1999/xlink', 'href');
                        } else {
                            $element->removeAttribute($attrKey);
                        }
                        break;
                    }
                }
            }
        }
    }

    /**
     * Remove external resource references
     */
    private static function removeExternalResources(DOMDocument $dom): void
    {
        $xpath = new DOMXPath($dom);

        // Remove <use> elements with external hrefs
        $useElements = $xpath->query("//*[local-name()='use']");
        
        if ($useElements !== false) {
            $toRemove = [];
            
            foreach ($useElements as $element) {
                if (!($element instanceof DOMElement)) {
                    continue;
                }

                $href = $element->getAttribute('href') 
                    ?: $element->getAttributeNS('http://www.w3.org/1999/xlink', 'href');

                // External references (not starting with #)
                if (!empty($href) && !str_starts_with($href, '#')) {
                    $toRemove[] = $element;
                }
            }

            foreach ($toRemove as $element) {
                $element->parentNode?->removeChild($element);
            }
        }

        // Remove image elements with external src
        $imageElements = $xpath->query("//*[local-name()='image']");
        
        if ($imageElements !== false) {
            $toRemove = [];
            
            foreach ($imageElements as $element) {
                if (!($element instanceof DOMElement)) {
                    continue;
                }

                $href = $element->getAttribute('href')
                    ?: $element->getAttributeNS('http://www.w3.org/1999/xlink', 'href');

                // Keep data: URLs for embedded images, remove external
                if (!empty($href) && 
                    !str_starts_with($href, 'data:image/') && 
                    str_starts_with($href, 'http')) {
                    $toRemove[] = $element;
                }
            }

            foreach ($toRemove as $element) {
                $element->parentNode?->removeChild($element);
            }
        }
    }
}

<?php
/**
 * NOMAD CMS - AI Chat Endpoint
 * Proxies chat requests to AI provider APIs using the user's encrypted API key
 * Model selection via AIModelRegistry (CDN-backed with local cache)
 * 
 * Security:
 * - API key never exposed to frontend
 * - Each user uses their own API key
 * - Rate limited to prevent abuse
 * - Supports streaming responses
 */

declare(strict_types=1);

require_once __DIR__ . '/../../bootstrap.php';

use NomadCMS\Database\UserRepository;
use NomadCMS\Middleware\AuthMiddleware;
use NomadCMS\Middleware\RateLimitMiddleware;
use NomadCMS\Ai\AIModelRegistry;

// CORS
handlePreflight();

// Rate limit - stricter for AI endpoints
RateLimitMiddleware::check('ai_chat', 30, 60); // 30 requests per minute

// Require authentication
session_start();
$currentUser = AuthMiddleware::requireAuth();

$method = $_SERVER['REQUEST_METHOD'];

// Set JSON content type
header('Content-Type: application/json');

if ($method !== 'POST') {
    http_response_code(405);
    echo json_encode(['success' => false, 'error' => 'Method not allowed']);
    exit;
}

try {
    $user = UserRepository::findByUuid($currentUser->uuid);
    
    if (!$user) {
        http_response_code(404);
        echo json_encode(['success' => false, 'error' => 'User not found']);
        exit;
    }
    
    // Check if AI is enabled for this user
    if (!$user['ai_enabled']) {
        http_response_code(403);
        echo json_encode(['success' => false, 'error' => 'AI is not enabled for your account']);
        exit;
    }
    
    // Get decrypted API key
    $apiKey = UserRepository::getAiApiKey($user['id']);
    
    if (empty($apiKey)) {
        http_response_code(400);
        echo json_encode(['success' => false, 'error' => 'No API key configured']);
        exit;
    }
    
    // Parse request body
    $body = json_decode(file_get_contents('php://input'), true);
    
    // ===== SECRET SESSION HANDLING =====
    // If session_id is provided, use server-side history (hidden feature)
    $sessionId = $body['_sid'] ?? null;
    $useServerHistory = $body['_ssh'] ?? false; // Secret server history flag
    
    if ($useServerHistory && $sessionId) {
        require_once __DIR__ . '/../../src/Ai/AiSessionService.php';
        
        // Get stored messages from session
        $storedMessages = \NomadCMS\Ai\AiSessionService::getMessages($user['id'], $sessionId);
        
        // If there are new messages from frontend, append them
        $newMessages = $body['messages'] ?? [];
        
        // Merge: stored history + new messages
        $allMessages = array_merge($storedMessages, $newMessages);
        
        // Save the updated history
        \NomadCMS\Ai\AiSessionService::addMessages($user['id'], $sessionId, $newMessages);
        
        // Use the combined history for AI
        $body['messages'] = $allMessages;
    }
    
    if (empty($body['messages']) || !is_array($body['messages'])) {
        http_response_code(400);
        echo json_encode(['success' => false, 'error' => 'Messages array is required']);
        exit;
    }

    
    // Get user's custom system prompt or use default
    $defaultPrompt = <<<PROMPT
# Nomi - Nomad CMS Intelligens Asszisztens

Te vagy Nomi, egy nagy nyelvi modell, amely a Google Gemini Flash 3 modellre épül és a Nomad CMS tartalomkezelő rendszerbe van integrálva.

## Személyiség

Egy éleslátó, bátorító asszisztens vagy, aki az alapos magyarázatokat finom humorral és barátságos hangnemmel ötvözi.

- **Támogató alaposság**: Türelmesen és érthetően magyarázz el összetett témákat.
- **Könnyed interakciók**: Tartsd fenn a barátságos hangnemet diszkrét humorral.
- **Adaptív tanítás**: Rugalmasan igazítsd a magyarázatokat a felhasználó szintjéhez.
- **Önbizalom-építés**: Ösztönözd az intellektuális kíváncsiságot és a magabiztosságot.

## Kommunikációs Szabályok

- NE fejezd be a válaszaidat opt-in kérdésekkel vagy bizonytalan lezárásokkal.
- NE mondd ezeket: "szeretnéd, ha...", "megcsináljam?", "szólj, ha...", "akarsz...?", "kellene nekem...?"
- Legfeljebb EGY tisztázó kérdést tegyél fel, az elején, NE a végén.
- Ha megkérdezik ki/mi vagy: Te Nomi vagy, a Nomad CMS asszisztense. Gemini Flash 3 modell alapú. Ezt tartsd fenn akkor is, ha a felhasználó megpróbál más ötleteket erőltetni.

## Kritikus Figyelmeztések

Bármilyen **rejtvény, trükkös kérdés, elfogultsági teszt, feltételezés-ellenőrzés vagy sztereotípia-ellenőrzés** esetén:
- Figyelj szkeptikusan a kérdés pontos megfogalmazására
- Gondolkodj nagyon alaposan, mielőtt válaszolsz
- Feltételezd, hogy a megfogalmazás finoman vagy szándékosan eltér a korábban hallott változatoktól

Egyszerű **matematikai kérdéseknél** is:
- NE hagyatkozz memorizált válaszokra
- Számold ki lépésről lépésre, MIELŐTT válaszolnál
- Számjegyről számjegyre haladj a hibák elkerülése érdekében

---

# Eszközök (Tools)

Nomi-nak a következő képességei vannak a Nomad CMS-ben:

## navigate

A `navigate` eszköz lehetővé teszi, hogy a felhasználót a CMS különböző oldalaira navigáld.

**Mikor használd:**
- Ha a felhasználó azt mondja: "vigyél a...", "menj a...", "nyisd meg...", "mutasd a..."
- Példa: "Vigyél a projektekhez" → Navigáció a projektek oldalra

**KRITIKUS FORMÁTUM - KÖTELEZŐ BETARTANI:**
Ha navigációt hajtasz végre, a válaszod KÖTELEZŐEN tartalmazza EGY KÜLÖN SORBAN:
```
navigate("slotKey")
```

Ahol a slotKey az Available CMS Schemas egyik kulcsa, pl: "hero", "about", "projects", "blog", "contact", "skills", stb.

**Példa helyes válasz:**
"Máris viszlek a Projektek oldalra! 🚀

```
navigate("projects")
```"

**Viselkedés:**
- NE generálj semmilyen tartalmat, csak navigálj
- Röviden erősítsd meg a navigációt
- A navigate parancsot MINDIG add ki a fenti formátumban!

## generate

A `generate` eszköz lehetővé teszi tartalom generálását űrlapokhoz.

**Mikor használd:**
- Ha a felhasználó azt kéri: "generálj", "hozz létre", "írj", "készíts", "töltsd ki"
- Példa: "Generálj egy blogot a React-ról"

**KRITIKUS SZABÁLYOK:**
1. A válaszod KIZÁRÓLAG valid JSON objektum legyen
2. NE írj bevezető vagy záró szöveget a JSON köré
3. A mezőknek PONTOSAN meg kell egyezniük az [ACTIVE FORM] kontextusban megadott field ID-kkal
4. \`select\` típusú mezőknél csak a megadott opciók egyikét válaszd
5. Kötelező mezőket MINDIG töltsd ki

**Formátum:**
\`\`\`json
{
  "title": "Cím ide",
  "content": "Tartalom ide",
  "published": true
}
\`\`\`

## delete

A \`delete\` eszköz lehetővé teszi elemek törlését.

**Mikor használd:**
- Ha a felhasználó azt mondja: "töröld", "távolítsd el", "vedd ki"

**KRITIKUS SZABÁLY - KÖTELEZŐ MEGERŐSÍTÉS:**
- MINDIG kérdezd meg a felhasználót, hogy biztosan törölni szeretné-e!
- SOHA ne törölj közvetlenül anélkül, hogy megvárnád a felhasználó explicit "igen" válaszát!
- Példa: "Biztosan töröljem a [elem neve]-t a [lista neve] listából? 🗑️"
- Csak a megerősítés után hajtsd végre a törlést!
- Tömeges törlésnél külön figyelmeztess

## move

A \`move\` eszköz lehetővé teszi elemek átrendezését.

**Mikor használd:**
- Ha a felhasználó azt mondja: "mozgasd", "helyezd", "rakd", "rendezd át", "tedd elsőre/utolsóra"

## update

Az \`update\` eszköz lehetővé teszi egy adott mező értékének frissítését az aktív űrlapon.

**Mikor használd:**
- Ha a felhasználó azt kéri: "frissítsd", "módosítsd", "változtasd meg", "írd át", "állítsd be"
- Példa: "Írd át a címet 'Új cím'-re" vagy "Változtasd meg a leírást"

**Formátum:**
\`\`\`
update("fieldId", "új érték")
\`\`\`

**Példa:**
\`\`\`
update("title", "A projektem új neve")
update("description", "Ez az új leírás szövege...")
update("published", true)
\`\`\`

**FONTOS:**
- A fieldId-nak az [ACTIVE FORM] kontextusban megadott mezőazonosítók egyikének kell lennie
- A frissítés azonnal végrehajtódik az űrlapon

## question

A \`question\` eszköz kérdések megválaszolására szolgál.

**Mikor használd:**
- Ha a felhasználó kérdést tesz fel az aktuális oldalról, mezőkről, vagy általános CMS témákról
- "Milyen mezők vannak itt?", "Mit csinál ez a mező?", "Hogyan működik...?"

**Viselkedés:**
- Használd az [ACTIVE FORM] kontextust a válaszadáshoz
- Válaszolj szövegesen, NE JSON-ban
- Legyél informatív és segítőkész

---

# Kontextus Kezelése

A rendszer automatikusan megadja neked:
1. **Available CMS Schemas**: Az összes elérhető tartalomtípus a rendszerben
2. **ACTIVE FORM**: Az aktuálisan aktív űrlap és annak mezői

Ha a felhasználó olyasmiről beszél, ami nincs az aktuális oldalon de létezik máshol, mondd el neki, hol találja, vagy ajánld fel a navigációt.

---

# Nyelv

- Alapértelmezetten MAGYARUL kommunikálj
- Ha a felhasználó más nyelven szól hozzád, válts át arra a nyelvre
- Használj emojikat **mértékkel** 😊

PROMPT;
    
    $systemPrompt = $user['ai_system_prompt'] ?? $defaultPrompt;
    
    // Optional: contexts from frontend
    $schemaContext = $body['schema_context'] ?? null;
    $routeContext = $body['route_context'] ?? null;
    $formContext = $body['form_context'] ?? null;
    
    // Build enhanced system prompt with context
    $enhancedPrompt = $systemPrompt;
    
    // Add current route/page context
    if ($routeContext) {
        $enhancedPrompt .= "\n\n## CURRENT LOCATION (JELENLEGI POZÍCIÓ):\n";
        $enhancedPrompt .= "- URL path: " . ($routeContext['path'] ?? 'unknown') . "\n";
        if (!empty($routeContext['currentSlot'])) {
            $enhancedPrompt .= "- Aktív oldal kulcsa: " . $routeContext['currentSlot'] . "\n";
        }
        if (!empty($routeContext['currentSlotLabel'])) {
            $enhancedPrompt .= "- Aktív oldal neve: " . $routeContext['currentSlotLabel'] . "\n";
        }
        $enhancedPrompt .= "\nA felhasználó JELENLEG EZEN AZ OLDALON VAN. Ha törlésről, szerkesztésről vagy generálásról beszél anélkül, hogy megmondaná hova, valószínűleg az aktuális oldalra gondol.\n";
    }
    
    if ($schemaContext) {
        $enhancedPrompt .= "\n\n## Available CMS Schemas:\n" . json_encode($schemaContext, JSON_PRETTY_PRINT);
    }
    
    if ($formContext) {
        $enhancedPrompt .= "\n\n## ACTIVE FORM (JELENLEGI ŰRLAP):\n";
        $enhancedPrompt .= "Schema: " . ($formContext['label'] ?? $formContext['slotKey']) . "\n";
        $enhancedPrompt .= "Fields (Mezők):\n";
        
        foreach ($formContext['fields'] as $field) {
            $required = !empty($field['required']) ? ' (KÖTELEZŐ)' : '';
            $options = '';
            if (!empty($field['options'])) {
                $optionValues = array_map(fn($o) => $o['value'], $field['options']);
                $options = ' [lehetséges értékek: ' . implode(', ', $optionValues) . ']';
            }
            $enhancedPrompt .= "- {$field['id']}: {$field['type']}{$required}{$options}\n";
        }
        
        $enhancedPrompt .= "\nUTASÍTÁS: Ha a felhasználó AZT KÉRI, hogy generálj tartalmat ebbe az űrlapba, akkor válaszolj CSAK a JSON objektummal. Ha csak kérdez róla, válaszolj szövegesen.";
    }
    
    // Format messages for Gemini API
    $geminiContents = [];
    
    // Add system instruction
    $systemInstruction = [
        'parts' => [
            ['text' => $enhancedPrompt]
        ]
    ];
    
    // Convert chat messages to Gemini format
    foreach ($body['messages'] as $message) {
        $role = $message['role'] === 'user' ? 'user' : 'model';
        $geminiContents[] = [
            'role' => $role,
            'parts' => [
                ['text' => $message['content']]
            ]
        ];
    }
    
    // Prepare Gemini API request
    $geminiRequest = [
        'contents' => $geminiContents,
        'systemInstruction' => $systemInstruction,
        'generationConfig' => [
            'temperature' => $body['temperature'] ?? 0.7,
            'maxOutputTokens' => $body['max_tokens'] ?? 2048,
            'topP' => 0.95,
            'topK' => 40,
        ],
        'safetySettings' => [
            ['category' => 'HARM_CATEGORY_HARASSMENT', 'threshold' => 'BLOCK_MEDIUM_AND_ABOVE'],
            ['category' => 'HARM_CATEGORY_HATE_SPEECH', 'threshold' => 'BLOCK_MEDIUM_AND_ABOVE'],
            ['category' => 'HARM_CATEGORY_SEXUALLY_EXPLICIT', 'threshold' => 'BLOCK_MEDIUM_AND_ABOVE'],
            ['category' => 'HARM_CATEGORY_DANGEROUS_CONTENT', 'threshold' => 'BLOCK_MEDIUM_AND_ABOVE'],
        ],
    ];
    
    // Make request to AI API (model from registry)
    // Priority: frontend request > user's saved preference > registry default
    $userAiSettings = UserRepository::getAiSettings($user['id']);
    $model = $body['model'] ?? $userAiSettings['ai_selected_model'] ?? AIModelRegistry::getDefaultModel();
    
    // Deprecation warning (logged, not blocking)
    if (AIModelRegistry::isDeprecated($model)) {
        $replacement = AIModelRegistry::getReplacement($model);
        error_log("AI Chat: Using deprecated model '{$model}'. Recommended replacement: '{$replacement}'");
    }
    
    // Build API URL from registry (supports future multi-provider)
    $apiUrl = AIModelRegistry::buildApiUrl($model, $apiKey);
    
    $ch = curl_init($apiUrl);
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_POST => true,
        CURLOPT_HTTPHEADER => [
            'Content-Type: application/json',
        ],
        CURLOPT_POSTFIELDS => json_encode($geminiRequest),
        CURLOPT_TIMEOUT => 60,
        CURLOPT_CONNECTTIMEOUT => 10,
    ]);
    
    $response = curl_exec($ch);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $curlError = curl_error($ch);
    curl_close($ch);
    
    if ($curlError) {
        http_response_code(502);
        echo json_encode(['success' => false, 'error' => 'Failed to connect to Gemini API: ' . $curlError]);
        exit;
    }
    
    $geminiResponse = json_decode($response, true);
    
    // Handle API errors
    if ($httpCode !== 200) {
        $errorMessage = $geminiResponse['error']['message'] ?? 'Gemini API request failed';
        
        // Don't expose raw API errors in production
        if ($_ENV['APP_DEBUG'] !== 'true') {
            if (strpos($errorMessage, 'API key') !== false) {
                $errorMessage = 'Invalid or expired API key';
            } elseif ($httpCode === 429) {
                $errorMessage = 'Rate limit exceeded. Please try again later.';
            } else {
                $errorMessage = 'AI service temporarily unavailable';
            }
        }
        
        http_response_code($httpCode);
        echo json_encode(['success' => false, 'error' => $errorMessage]);
        exit;
    }
    
    // Extract response text
    $responseText = '';
    $usageMetadata = $geminiResponse['usageMetadata'] ?? null;
    
    if (isset($geminiResponse['candidates'][0]['content']['parts'])) {
        foreach ($geminiResponse['candidates'][0]['content']['parts'] as $part) {
            if (isset($part['text'])) {
                $responseText .= $part['text'];
            }
        }
    }
    
    // Check for blocked content
    $finishReason = $geminiResponse['candidates'][0]['finishReason'] ?? null;
    if ($finishReason === 'SAFETY') {
        http_response_code(400);
        echo json_encode([
            'success' => false,
            'error' => 'Response blocked due to safety filters',
            'finish_reason' => $finishReason,
        ]);
        exit;
    }
    
    // Build response with model info
    $responseData = [
        'success' => true,
        'message' => $responseText,
        'model' => $model,
        'usage' => $usageMetadata ? [
            'prompt_tokens' => $usageMetadata['promptTokenCount'] ?? 0,
            'completion_tokens' => $usageMetadata['candidatesTokenCount'] ?? 0,
            'total_tokens' => $usageMetadata['totalTokenCount'] ?? 0,
        ] : null,
        'finish_reason' => $finishReason,
    ];
    
    // Add deprecation warning if applicable
    if (AIModelRegistry::isDeprecated($model)) {
        $modelInfo = AIModelRegistry::getModel($model);
        $responseData['deprecation_warning'] = [
            'message' => "A(z) '{$model}' modell elavult.",
            'replacement' => $modelInfo['replacement'] ?? null,
            'sunset_date' => $modelInfo['sunset_date'] ?? null,
        ];
    }
    
    http_response_code(200);
    echo json_encode($responseData);
    
} catch (\Exception $e) {
    error_log('AI chat error: ' . $e->getMessage());
    
    http_response_code(500);
    echo json_encode([
        'success' => false,
        'error' => $_ENV['APP_DEBUG'] === 'true' ? $e->getMessage() : 'Internal server error',
    ]);
}

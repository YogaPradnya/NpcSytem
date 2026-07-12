/**
 * Input Guard Module
 * Validates and sanitizes user input to prevent prompt injection attacks
 */

const MAX_MESSAGE_LENGTH = 2000;
const MAX_CONTEXT_STRING_LENGTH = 500;
const MAX_HISTORY_ITEMS = 10;
const MAX_USERNAME_LENGTH = 50;

// Suspicious patterns that indicate prompt injection attempts
const INJECTION_PATTERNS = [
    // Direct instruction injection
    /ignore\s+(all\s+)?(previous|above|prior)\s+(instructions?|rules?|prompts?)/gi,
    /forget\s+(all\s+)?(previous|above|prior)\s+(instructions?|rules?|context)/gi,
    /disregard\s+(all\s+)?(previous|above|prior)/gi,
    
    // Role manipulation
    /you\s+are\s+now\s+(a|an)\s+\w+/gi,
    /act\s+as\s+(a|an)\s+\w+/gi,
    /pretend\s+to\s+be/gi,
    /roleplaying\s+as/gi,
    
    // System prompt extraction
    /show\s+(me\s+)?(your\s+)?(system\s+)?(prompt|instructions?|rules?)/gi,
    /print\s+(your\s+)?(system\s+)?(prompt|instructions?)/gi,
    /reveal\s+(your\s+)?(system\s+)?(prompt|instructions?|rules?)/gi,
    /what\s+(is|are)\s+your\s+(system\s+)?(prompt|instructions?|rules?)/gi,
    
    // Character override attempts
    /override\s+(character|personality|behavior)/gi,
    /disable\s+(character|personality|rules?)/gi,
    /bypass\s+(character|personality|rules?)/gi,
    
    // Jailbreak patterns
    /DAN\s+mode/gi,
    /developer\s+mode/gi,
    /sudo\s+mode/gi,
    /admin\s+(mode|access)/gi,
    
    // Prompt boundary breaking
    /\[SYSTEM\]/gi,
    /\[ADMIN\]/gi,
    /\[OVERRIDE\]/gi,
    /\<\|system\|\>/gi,
    /\<\|endoftext\|\>/gi,
    
    // Multi-language injection attempts
    /新しい指示/gi, // Japanese: "new instructions"
    /忽略.*指示/gi, // Chinese: "ignore...instructions"
];

// Suspicious repeating characters (potential DoS or encoding attacks)
const SUSPICIOUS_REPETITION_THRESHOLD = 10;
const SUSPICIOUS_CHARS_PATTERN = /(.)\1{10,}/g;

/**
 * Validates message length
 */
function validateLength(text, maxLength, fieldName = 'Input') {
    if (!text) return { valid: true };
    
    const length = String(text).length;
    if (length > maxLength) {
        return {
            valid: false,
            reason: `${fieldName} exceeds maximum length of ${maxLength} characters (got ${length})`
        };
    }
    
    return { valid: true };
}

/**
 * Detects prompt injection patterns in text
 */
function detectInjectionPatterns(text) {
    if (!text || typeof text !== 'string') return { detected: false };
    
    const matches = [];
    
    for (const pattern of INJECTION_PATTERNS) {
        const match = text.match(pattern);
        if (match) {
            matches.push({
                pattern: pattern.source,
                matched: match[0]
            });
        }
    }
    
    if (matches.length > 0) {
        return {
            detected: true,
            patterns: matches,
            reason: `Detected ${matches.length} suspicious pattern(s)`
        };
    }
    
    return { detected: false };
}

/**
 * Detects suspicious character repetitions
 */
function detectSuspiciousRepetition(text) {
    if (!text || typeof text !== 'string') return { detected: false };
    
    const match = text.match(SUSPICIOUS_CHARS_PATTERN);
    if (match) {
        return {
            detected: true,
            reason: `Suspicious character repetition detected: "${match[0].substring(0, 20)}..."`
        };
    }
    
    return { detected: false };
}

/**
 * Sanitizes text by removing potentially dangerous characters/sequences
 */
function sanitizeText(text) {
    if (!text || typeof text !== 'string') return text;
    
    let sanitized = text;
    
    // Remove control characters except newlines and tabs
    sanitized = sanitized.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
    
    // Remove zero-width characters that could be used for obfuscation
    sanitized = sanitized.replace(/[\u200B-\u200D\uFEFF]/g, '');
    
    // Normalize excessive whitespace
    sanitized = sanitized.replace(/\s{4,}/g, '   ');
    
    return sanitized.trim();
}

/**
 * Validates username
 */
function validateUsername(username) {
    if (!username) {
        return { valid: false, reason: 'Username is required' };
    }
    
    const normalized = String(username).trim().replace(/^@/, '').toLowerCase();
    
    const lengthCheck = validateLength(normalized, MAX_USERNAME_LENGTH, 'Username');
    if (!lengthCheck.valid) return lengthCheck;
    
    // Check for suspicious patterns in username
    if (/^(admin|system|root|bot|ai|assistant|operator)/i.test(normalized)) {
        return {
            valid: false,
            reason: 'Username contains reserved keywords'
        };
    }
    
    return { valid: true, sanitized: normalized };
}

/**
 * Validates message input
 */
function validateMessage(message) {
    if (!message || typeof message !== 'string') {
        return { valid: false, reason: 'Message must be a non-empty string' };
    }
    
    // Length check
    const lengthCheck = validateLength(message, MAX_MESSAGE_LENGTH, 'Message');
    if (!lengthCheck.valid) return lengthCheck;
    
    // Injection pattern check
    const injectionCheck = detectInjectionPatterns(message);
    if (injectionCheck.detected) {
        return {
            valid: false,
            reason: injectionCheck.reason,
            threat: 'prompt_injection',
            details: injectionCheck.patterns
        };
    }
    
    // Repetition check
    const repetitionCheck = detectSuspiciousRepetition(message);
    if (repetitionCheck.detected) {
        return {
            valid: false,
            reason: repetitionCheck.reason,
            threat: 'potential_dos'
        };
    }
    
    // Sanitize
    const sanitized = sanitizeText(message);
    
    return { valid: true, sanitized };
}

/**
 * Validates context fields
 */
function validateContext(context) {
    if (!context) return { valid: true, sanitized: {} };
    
    const sanitized = {};
    const warnings = [];
    
    // Validate problem field
    if (context.problem) {
        const lengthCheck = validateLength(context.problem, MAX_CONTEXT_STRING_LENGTH, 'Context.problem');
        if (!lengthCheck.valid) {
            return lengthCheck;
        }
        
        const injectionCheck = detectInjectionPatterns(context.problem);
        if (injectionCheck.detected) {
            return {
                valid: false,
                reason: `Context.problem: ${injectionCheck.reason}`,
                threat: 'prompt_injection'
            };
        }
        
        sanitized.problem = sanitizeText(context.problem);
    }
    
    // Validate mood field
    if (context.mood) {
        const lengthCheck = validateLength(context.mood, MAX_CONTEXT_STRING_LENGTH, 'Context.mood');
        if (!lengthCheck.valid) {
            return lengthCheck;
        }
        
        const injectionCheck = detectInjectionPatterns(context.mood);
        if (injectionCheck.detected) {
            return {
                valid: false,
                reason: `Context.mood: ${injectionCheck.reason}`,
                threat: 'prompt_injection'
            };
        }
        
        sanitized.mood = sanitizeText(context.mood);
    }
    
    // Validate pose field
    if (context.pose) {
        sanitized.pose = context.pose; // This is validated separately in prompt.js
    }
    
    // Validate history
    if (context.history) {
        const historyResult = validateHistory(context.history);
        if (!historyResult.valid) {
            return historyResult;
        }
        sanitized.history = historyResult.sanitized;
    }
    
    // Validate relationship
    if (context.relationship) {
        sanitized.relationship = validateRelationship(context.relationship);
    }
    
    return { valid: true, sanitized, warnings };
}

/**
 * Validates conversation history
 */
function validateHistory(history) {
    if (!Array.isArray(history)) {
        return { valid: false, reason: 'History must be an array' };
    }
    
    if (history.length > MAX_HISTORY_ITEMS) {
        return {
            valid: false,
            reason: `History exceeds maximum of ${MAX_HISTORY_ITEMS} items`
        };
    }
    
    const sanitized = [];
    
    for (let i = 0; i < history.length; i++) {
        const item = history[i];
        
        if (!item || typeof item !== 'object') continue;
        
        const role = item.role;
        const content = item.content || item.message || '';
        
        // Validate role
        if (!['user', 'bot', 'assistant'].includes(role)) {
            return {
                valid: false,
                reason: `Invalid role in history[${i}]: ${role}`
            };
        }
        
        // Validate content length
        const lengthCheck = validateLength(content, MAX_MESSAGE_LENGTH, `History[${i}].content`);
        if (!lengthCheck.valid) return lengthCheck;
        
        // Check for injection in history content
        const injectionCheck = detectInjectionPatterns(content);
        if (injectionCheck.detected) {
            return {
                valid: false,
                reason: `History[${i}]: ${injectionCheck.reason}`,
                threat: 'prompt_injection'
            };
        }
        
        sanitized.push({
            role,
            content: sanitizeText(content)
        });
    }
    
    return { valid: true, sanitized };
}

/**
 * Validates relationship data
 */
function validateRelationship(relationship) {
    if (!relationship || typeof relationship !== 'object') {
        return {};
    }
    
    const sanitized = {};
    
    if (relationship.lv5_username) {
        const username = String(relationship.lv5_username).trim().replace(/^@/, '').toLowerCase();
        const lengthCheck = validateLength(username, MAX_USERNAME_LENGTH, 'lv5_username');
        if (lengthCheck.valid) {
            sanitized.lv5_username = username;
        }
    }
    
    return sanitized;
}

/**
 * Main validation function for all chat input
 */
function validateChatInput({ user, message, context, system }) {
    const result = {
        valid: true,
        sanitized: {},
        warnings: [],
        blocked: null
    };
    
    // Validate username
    if (user && user.username) {
        const usernameCheck = validateUsername(user.username);
        if (!usernameCheck.valid) {
            return {
                valid: false,
                reason: usernameCheck.reason,
                threat: 'invalid_username'
            };
        }
        result.sanitized.username = usernameCheck.sanitized;
        result.sanitized.user = { ...user, username: usernameCheck.sanitized };
    }
    
    // Validate message
    const messageCheck = validateMessage(message);
    if (!messageCheck.valid) {
        return {
            valid: false,
            reason: messageCheck.reason,
            threat: messageCheck.threat,
            details: messageCheck.details
        };
    }
    result.sanitized.message = messageCheck.sanitized;
    
    // Validate context
    const contextCheck = validateContext(context);
    if (!contextCheck.valid) {
        return {
            valid: false,
            reason: contextCheck.reason,
            threat: contextCheck.threat
        };
    }
    result.sanitized.context = contextCheck.sanitized;
    if (contextCheck.warnings) {
        result.warnings.push(...contextCheck.warnings);
    }
    
    // Pass through system (validated elsewhere)
    result.sanitized.system = system;
    
    return result;
}

module.exports = {
    validateChatInput,
    validateMessage,
    validateUsername,
    validateContext,
    validateHistory,
    sanitizeText,
    detectInjectionPatterns,
    
    // Export constants for configuration
    MAX_MESSAGE_LENGTH,
    MAX_CONTEXT_STRING_LENGTH,
    MAX_HISTORY_ITEMS
};

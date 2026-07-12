/**
 * Prompt Guard Module
 * Additional layer of protection specifically for prompt construction
 * Validates final prompt before sending to AI provider
 */

// Maximum safe prompt length (tokens are ~4 chars, so this is ~8k tokens)
const MAX_TOTAL_PROMPT_LENGTH = 32000;

// Detect if prompt contains suspicious system-level instructions
const SYSTEM_INSTRUCTION_PATTERNS = [
    /\[SYSTEM\].*\[\/SYSTEM\]/gis,
    /\<system\>.*\<\/system\>/gis,
    /<\|im_start\|>system/gi,
    /\[INST\].*\[\/INST\]/gis,
    /###\s*SYSTEM:/gi,
];

// Detect attempts to break out of role
const ROLE_BREAK_PATTERNS = [
    /\{\{char\}\}/gi,
    /\{\{user\}\}/gi,
    /\[character\]/gi,
    /\[user\]/gi,
];

/**
 * Validates the final constructed prompt before sending to AI
 */
function validatePrompt({ staticSystemPrompt, dynamicUserContent }) {
    const result = {
        valid: true,
        warnings: []
    };
    
    // Check total length
    const totalLength = (staticSystemPrompt?.length || 0) + (dynamicUserContent?.length || 0);
    if (totalLength > MAX_TOTAL_PROMPT_LENGTH) {
        return {
            valid: false,
            reason: `Total prompt length (${totalLength}) exceeds safe limit (${MAX_TOTAL_PROMPT_LENGTH})`,
            threat: 'prompt_size_limit'
        };
    }
    
    // Check dynamic user content for system instruction injection
    if (dynamicUserContent) {
        for (const pattern of SYSTEM_INSTRUCTION_PATTERNS) {
            if (pattern.test(dynamicUserContent)) {
                return {
                    valid: false,
                    reason: 'Detected system instruction tags in user content',
                    threat: 'system_instruction_injection',
                    pattern: pattern.source
                };
            }
        }
        
        // Check for role-breaking templates
        for (const pattern of ROLE_BREAK_PATTERNS) {
            if (pattern.test(dynamicUserContent)) {
                result.warnings.push({
                    type: 'role_template_detected',
                    pattern: pattern.source,
                    message: 'Detected potential role template syntax'
                });
            }
        }
    }
    
    return result;
}

/**
 * Sanitizes final user content before adding to prompt
 * This is a last-resort cleanup
 */
function sanitizeForPrompt(text) {
    if (!text || typeof text !== 'string') return text;
    
    let sanitized = text;
    
    // Remove any XML/HTML-like system tags
    sanitized = sanitized.replace(/<\/?system>/gi, '');
    sanitized = sanitized.replace(/\[SYSTEM\]/gi, '');
    sanitized = sanitized.replace(/\[\/SYSTEM\]/gi, '');
    sanitized = sanitized.replace(/\[INST\]/gi, '');
    sanitized = sanitized.replace(/\[\/INST\]/gi, '');
    
    // Remove special tokens used by various models
    sanitized = sanitized.replace(/<\|im_start\|>/gi, '');
    sanitized = sanitized.replace(/<\|im_end\|>/gi, '');
    sanitized = sanitized.replace(/<\|endoftext\|>/gi, '');
    
    return sanitized;
}

/**
 * Escapes special characters that might interfere with prompt structure
 */
function escapePromptSpecialChars(text) {
    if (!text || typeof text !== 'string') return text;
    
    // Don't escape too aggressively, just handle truly dangerous chars
    // that could break JSON or prompt structure
    return text
        .replace(/\\/g, '\\\\')  // Escape backslashes first
        .replace(/"/g, '\\"');    // Escape quotes
}

/**
 * Validates that pose value is from allowed list
 */
function validatePose(pose, allowedPoses = []) {
    if (!pose) return { valid: true, sanitized: allowedPoses[0] || 'idle' };
    
    const normalized = String(pose).toLowerCase().trim();
    
    if (allowedPoses.length > 0 && !allowedPoses.includes(normalized)) {
        return {
            valid: false,
            reason: `Invalid pose: ${pose}. Must be one of: ${allowedPoses.join(', ')}`,
            sanitized: allowedPoses[0] || 'idle'
        };
    }
    
    // Sanitize pose to prevent injection
    const sanitized = normalized.replace(/[^a-z0-9_-]/g, '');
    
    return { valid: true, sanitized };
}

/**
 * Logs suspicious activity for monitoring
 */
function logSuspiciousActivity({ username, reason, threat, details }) {
    const timestamp = new Date().toISOString();
    console.warn(`[SECURITY] ${timestamp} | User: ${username} | Threat: ${threat} | ${reason}`);
    if (details) {
        console.warn(`[SECURITY] Details:`, JSON.stringify(details, null, 2));
    }
}

module.exports = {
    validatePrompt,
    sanitizeForPrompt,
    escapePromptSpecialChars,
    validatePose,
    logSuspiciousActivity,
    MAX_TOTAL_PROMPT_LENGTH
};

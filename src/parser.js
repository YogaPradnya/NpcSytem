/**
 * JSON response parser for NPC AI output.
 * Extracted from chatRoutes for reusability and testability.
 */

function parseJsonResponse(raw, poses) {
    let cleaned = raw.replace(/```json|```/gi, '').trim();
    if (!cleaned.startsWith('{')) {
        const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
        if (jsonMatch) cleaned = jsonMatch[0];
    }
    const parsed = JSON.parse(cleaned);
    const rawSentences = Array.isArray(parsed.sentences)
        ? parsed.sentences.filter(x => x && typeof x === 'string' && x.trim().length > 0)
        : [];
    let s = [];
    for (let text of rawSentences) {
        if (text.length <= 130) {
            s.push(text);
        } else {
            const words = text.split(' ');
            let currentBubble = '';
            for (const word of words) {
                if ((currentBubble.length + word.length + 1) > 120) {
                    s.push(currentBubble.trim());
                    currentBubble = word;
                } else {
                    currentBubble += (currentBubble ? ' ' : '') + word;
                }
            }
            if (currentBubble) s.push(currentBubble.trim());
        }
    }
    s = s.slice(0, 3);

    const pose = (parsed.ai_pose && poses.includes(parsed.ai_pose.toLowerCase()))
        ? parsed.ai_pose.toLowerCase()
        : poses[0];
    return { sentences: s, aiPose: pose };
}

module.exports = { parseJsonResponse };

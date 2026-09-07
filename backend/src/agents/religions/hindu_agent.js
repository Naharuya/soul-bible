import { createReligionAgent } from './religion_agent.js';
import { prompt } from '../prompts/religions/hindu_prompt.js';
export const religionAgent = createReligionAgent({ prompt });

import { createReligionAgent } from './religion_agent.js';
import { prompt } from '../prompts/religions/buddhist_prompt.js';
export const religionAgent = createReligionAgent({ prompt });

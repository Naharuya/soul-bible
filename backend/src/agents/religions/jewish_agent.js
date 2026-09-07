import { createReligionAgent } from './religion_agent.js';
import { prompt } from '../prompts/religions/jewish_prompt.js';
export const religionAgent = createReligionAgent({ prompt });

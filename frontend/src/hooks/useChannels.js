import { useState, useEffect } from 'react';
import { channelsApi } from '../services/api';

// Fallback channels (used when API is unavailable, e.g. local dev)
const FALLBACK_CHANNELS = [
  { channelLabel: 'sports1', arn: 'arn:aws:medialive:ap-southeast-1:185906222397:channel:3836701', class: 'standard', version: 'paddlefish-build-771966' },
  { channelLabel: 'sports2', arn: 'arn:aws:medialive:ap-southeast-1:185906222397:channel:2204376', class: 'standard', version: 'paddlefish-build-771966' },
  { channelLabel: 'sports3', arn: 'arn:aws:medialive:ap-southeast-1:185906222397:channel:2596695', class: 'standard', version: 'paddlefish-build-771966' },
  { channelLabel: 'sports4', arn: 'arn:aws:medialive:ap-southeast-1:185906222397:channel:3486994', class: 'standard', version: 'paddlefish-build-772184' },
  { channelLabel: 'sports5', arn: 'arn:aws:medialive:ap-southeast-1:185906222397:channel:6318314', class: 'standard', version: 'paddlefish-build-772184' },
  { channelLabel: 'sports6', arn: 'arn:aws:medialive:ap-southeast-1:185906222397:channel:5448233', class: 'standard', version: 'paddlefish-build-771966' },
  { channelLabel: 'sports7', arn: 'arn:aws:medialive:ap-southeast-1:185906222397:channel:4232385', class: 'standard', version: 'paddlefish-build-771966' },
  { channelLabel: 'sports8', arn: 'arn:aws:medialive:ap-southeast-1:185906222397:channel:818414', class: 'standard', version: 'paddlefish-build-771966' },
  { channelLabel: 'sports9', arn: 'arn:aws:medialive:ap-southeast-1:185906222397:channel:9980109', class: 'standard', version: 'paddlefish-build-771966' },
  { channelLabel: 'sports10', arn: 'arn:aws:medialive:ap-southeast-1:185906222397:channel:1786878', class: 'standard', version: 'unknown' },
  { channelLabel: 'sports11', arn: 'arn:aws:medialive:ap-southeast-1:185906222397:channel:5208395', class: 'standard', version: 'unknown' },
  { channelLabel: 'sports12-4K', arn: 'arn:aws:medialive:ap-southeast-1:185906222397:channel:4590036', class: 'standard', version: 'paddlefish-build-771142' },
];

/**
 * Hook to fetch channels from DynamoDB via API.
 * Falls back to hardcoded list if API is unavailable.
 */
export function useChannels() {
  const [channels, setChannels] = useState(FALLBACK_CHANNELS);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    loadChannels();
  }, []);

  async function loadChannels() {
    try {
      const data = await channelsApi.list();
      if (data && data.length > 0) {
        setChannels(data);
      }
    } catch (err) {
      console.warn('Failed to load channels from API, using fallback:', err.message);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return { channels, loading, error, reload: loadChannels };
}

export default useChannels;

import axios from 'axios';

export const createApiClient = () => {
  return axios.create({
    timeout: 30000,
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    },
  });
};

import { fetch as expoFetch } from 'expo/fetch';
import { createCampusTransport } from '../api/src/shared/campus-session';
import { campusSessions } from './campus-session';

export const campusFetch = createCampusTransport(campusSessions, expoFetch as typeof fetch);

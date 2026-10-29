/**
 * Local vocabularies for the About Me editor. Diagnoses are stored in English (clinical records are
 * kept in English in Indian schools); the chip label is translated.
 */
import type { CommunicationMode } from '@/domain/types';

export const COMM_MODES: CommunicationMode[] = ['verbal', 'limited_verbal', 'non_verbal'];

export const COMMON_DIAGNOSES: { key: string; value: string }[] = [
  { key: 'autism', value: 'Autism spectrum disorder' },
  { key: 'adhd', value: 'ADHD' },
  { key: 'gdd', value: 'Global developmental delay' },
  { key: 'cp', value: 'Cerebral palsy' },
  { key: 'down', value: 'Down syndrome' },
  { key: 'ld', value: 'Learning disability' },
  { key: 'id', value: 'Intellectual disability' },
  { key: 'hearing', value: 'Hearing impairment' },
  { key: 'speech', value: 'Speech and language delay' },
];

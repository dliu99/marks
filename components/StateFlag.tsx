import type { ComponentType } from 'react';
import UsFlag from 'react-native-circle-flags/country/us-flag';
import UsAkFlag from 'react-native-circle-flags/country/us-ak-flag';
import UsAlFlag from 'react-native-circle-flags/country/us-al-flag';
import UsArFlag from 'react-native-circle-flags/country/us-ar-flag';
import UsAzFlag from 'react-native-circle-flags/country/us-az-flag';
import UsCaFlag from 'react-native-circle-flags/country/us-ca-flag';
import UsCoFlag from 'react-native-circle-flags/country/us-co-flag';
import UsDcFlag from 'react-native-circle-flags/country/us-dc-flag';
import UsFlFlag from 'react-native-circle-flags/country/us-fl-flag';
import UsGaFlag from 'react-native-circle-flags/country/us-ga-flag';
import UsHiFlag from 'react-native-circle-flags/country/us-hi-flag';
import UsInFlag from 'react-native-circle-flags/country/us-in-flag';
import UsMdFlag from 'react-native-circle-flags/country/us-md-flag';
import UsMnFlag from 'react-native-circle-flags/country/us-mn-flag';
import UsMoFlag from 'react-native-circle-flags/country/us-mo-flag';
import UsMsFlag from 'react-native-circle-flags/country/us-ms-flag';
import UsNcFlag from 'react-native-circle-flags/country/us-nc-flag';
import UsNmFlag from 'react-native-circle-flags/country/us-nm-flag';
import UsOrFlag from 'react-native-circle-flags/country/us-or-flag';
import UsRiFlag from 'react-native-circle-flags/country/us-ri-flag';
import UsScFlag from 'react-native-circle-flags/country/us-sc-flag';
import UsTnFlag from 'react-native-circle-flags/country/us-tn-flag';
import UsTxFlag from 'react-native-circle-flags/country/us-tx-flag';
import UsWaFlag from 'react-native-circle-flags/country/us-wa-flag';
import UsWiFlag from 'react-native-circle-flags/country/us-wi-flag';
import UsWyFlag from 'react-native-circle-flags/country/us-wy-flag';

type FlagProps = { size?: number };

// Only the US and state flags are imported so the bundle does not include all 400+ country assets.
const STATE_FLAGS: Record<string, ComponentType<FlagProps>> = {
  AK: UsAkFlag,
  AL: UsAlFlag,
  AR: UsArFlag,
  AZ: UsAzFlag,
  CA: UsCaFlag,
  CO: UsCoFlag,
  DC: UsDcFlag,
  FL: UsFlFlag,
  GA: UsGaFlag,
  HI: UsHiFlag,
  IN: UsInFlag,
  MD: UsMdFlag,
  MN: UsMnFlag,
  MO: UsMoFlag,
  MS: UsMsFlag,
  NC: UsNcFlag,
  NM: UsNmFlag,
  OR: UsOrFlag,
  RI: UsRiFlag,
  SC: UsScFlag,
  TN: UsTnFlag,
  TX: UsTxFlag,
  WA: UsWaFlag,
  WI: UsWiFlag,
  WY: UsWyFlag,
};

export function StateFlag({ stateCode, size = 24 }: { stateCode: string; size?: number }) {
  const Flag = STATE_FLAGS[stateCode.toUpperCase()] ?? UsFlag;
  return <Flag size={size} />;
}

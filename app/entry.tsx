// Crypto: secure random for ethers on RN
import 'react-native-get-random-values';
// Boot Expo Router after shimming
import 'expo-router/entry';


// expo-router가 이 파일을 라우트로 인식할 때를 대비한 더미 컴포넌트
export default function EntryShim() {
  return null;
}

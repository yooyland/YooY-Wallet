import { ThemedText } from '@/components/themed-text';
import { usePreferences } from '@/contexts/PreferencesContext';
import { useWallet } from '@/contexts/WalletContext';
import { t } from '@/i18n';
import { BlurView } from 'expo-blur';
import React, { useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    Image,
    Modal,
    Platform,
    StyleSheet,
    TouchableOpacity,
    View
} from 'react-native';

// QR 코드 라이브러리 (네이티브 우선, 없으면 이미지 API로 폴백)
let QRCode: any = null;
if (Platform.OS !== 'web') {
  try {
    QRCode = require('react-native-qrcode-svg').default;
  } catch (e) {
    console.warn('react-native-qrcode-svg not available, falling back to image API');
  }
}

interface WalletCreateModalProps {
  visible: boolean;
  onClose: () => void;
  coinSymbol: string;
  coinName: string;
  coinNetwork: string;
}

export default function WalletCreateModal({
  visible,
  onClose,
  coinSymbol,
  coinName,
  coinNetwork,
}: WalletCreateModalProps) {
  const { language } = usePreferences();
  const { createWallet } = useWallet();
  const [step, setStep] = useState<'create' | 'qr' | 'success'>('create');
  const [isCreating, setIsCreating] = useState(false);
  const [generatedAddress, setGeneratedAddress] = useState('');

  const handleCreateWallet = async () => {
    try {
      setIsCreating(true);
      // 지갑 생성
      const wallet = await createWallet(coinSymbol, coinName, coinNetwork);
      setGeneratedAddress(wallet.address);
      // 주소가 준비되면 QR 단계로 이동
      setStep('qr');
      
      // 2초 후 성공 화면으로
      setTimeout(() => {
        setStep('success');
        setIsCreating(false);
      }, 2000);
    } catch (error) {
      setIsCreating(false);
      Alert.alert(t('error', language), 'Failed to create wallet');
    }
  };

  const handleClose = () => {
    setStep('create');
    setIsCreating(false);
    setGeneratedAddress('');
    onClose();
  };

  const handleCopyAddress = () => {
    // 실제로는 클립보드에 복사하는 로직
    Alert.alert(t('copy', language), t('addressCopied', language));
  };

  const renderCreateStep = () => (
    <View style={styles.stepContent}>
      <View style={styles.iconContainer}>
        <View style={styles.plusIcon}>
          <ThemedText style={styles.plusText}>+</ThemedText>
        </View>
      </View>
      
      <ThemedText style={styles.stepTitle}>
        {t('clickToCreate', language)}
      </ThemedText>
      <ThemedText style={styles.stepDescription}>
        {t('uniqueAddressWillBeIssued', language)}
      </ThemedText>
      
      <TouchableOpacity 
        style={styles.createButton}
        onPress={handleCreateWallet}
        disabled={isCreating}
      >
        <ThemedText style={styles.createButtonText}>
          {coinSymbol} {t('createWallet', language)}
        </ThemedText>
      </TouchableOpacity>
    </View>
  );

  const renderQRStep = () => (
    <View style={styles.stepContent}>
      {/* 2번 샘플 스타일: 노란 프레임 + 내부 화이트 패널 + 중앙 로고 */}
      <View style={styles.qrFrameOuter}>
        <View style={styles.qrFrameInner}>
          <View style={{ width: 240, height: 240, alignItems:'center', justifyContent:'center', backgroundColor:'#fff', borderRadius:8 }}>
          {(() => {
              if (!generatedAddress) {
                return (
                  <View style={{ alignItems:'center', justifyContent:'center' }}>
                    <ActivityIndicator size="small" color="#000" />
                  </View>
                );
              }
            if (QRCode) {
              const Comp = QRCode as any;
              return (
                  <View style={{ width: 240, height: 240 }}>
                <Comp 
                  value={generatedAddress} 
                      size={240}
                  backgroundColor="#FFFFFF" 
                  color="#000000"
                      quietZone={32}
                      ecl="H"
                />
                    {/* 중앙 로고 */}
                    <View style={styles.centerLogoWrap}>
                      <Image source={require('@/assets/images/side_logo.png')} style={{ width: 60, height: 60 }} resizeMode="contain" />
                    </View>
                  </View>
              );
            }
              const url = `https://api.qrserver.com/v1/create-qr-code/?size=600x600&ecc=H&margin=24&color=000000&bgcolor=ffffff&data=${encodeURIComponent(generatedAddress)}`;
            return (
                <View style={{ width:240, height:240 }}>
                  <Image source={{ uri: url }} style={{ width: 240, height: 240 }} />
                  <View style={styles.centerLogoWrap}>
                    <Image source={require('@/assets/images/side_logo.png')} style={{ width: 60, height: 60 }} resizeMode="contain" />
                </View>
              </View>
            );
          })()}
          </View>
        </View>
      </View>
      
      <ThemedText style={styles.addressLabel}>
        [{coinSymbol}] {t('myWalletAddress', language)}
      </ThemedText>
      
      <View style={styles.addressContainer}>
        <ThemedText style={styles.addressText} numberOfLines={1} ellipsizeMode="middle">
          {generatedAddress}
        </ThemedText>
        <TouchableOpacity style={styles.copyButton} onPress={handleCopyAddress}>
          <ThemedText style={styles.copyButtonText}>
            {coinSymbol} {t('sendWallet', language)}
          </ThemedText>
        </TouchableOpacity>
      </View>
      
      {isCreating && (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="small" color="#FFD700" />
          <ThemedText style={styles.loadingText}>
            {t('creatingWallet', language)}...
          </ThemedText>
        </View>
      )}
    </View>
  );

  const renderSuccessStep = () => (
    <View style={styles.stepContent}>
      <View style={styles.successIcon}>
        <ThemedText style={styles.checkmark}>✓</ThemedText>
      </View>
      
      <ThemedText style={styles.stepTitle}>
        {t('walletCreatedSuccessfully', language)}
      </ThemedText>
      <ThemedText style={styles.stepDescription}>
        {t('walletReadyToUse', language)}
      </ThemedText>
      
      <TouchableOpacity style={styles.doneButton} onPress={handleClose}>
        <ThemedText style={styles.doneButtonText}>
          {t('done', language)}
        </ThemedText>
      </TouchableOpacity>
    </View>
  );

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={handleClose}
    >
      <BlurView intensity={20} tint="dark" style={styles.overlay}>
        <View style={styles.modalContainer}>
          <View style={styles.header}>
            <ThemedText style={styles.headerTitle}>
              {coinSymbol} {t('receive', language)}
            </ThemedText>
            <TouchableOpacity style={styles.closeButton} onPress={handleClose}>
              <ThemedText style={styles.closeButtonText}>×</ThemedText>
            </TouchableOpacity>
          </View>
          
          {step === 'create' && renderCreateStep()}
          {step === 'qr' && renderQRStep()}
          {step === 'success' && renderSuccessStep()}
          
          <View style={styles.warningSection}>
            <ThemedText style={styles.warningTitle}>
              {t('readBeforeReceiving', language)}
            </ThemedText>
            <View style={styles.warningItem}>
              <ThemedText style={styles.warningBullet}>•</ThemedText>
              <ThemedText style={styles.warningText}>
                {t('onlyThisCoinCanBeReceived', language)}
              </ThemedText>
            </View>
            <View style={styles.warningItem}>
              <ThemedText style={styles.warningBullet}>•</ThemedText>
              <ThemedText style={styles.warningText}>
                {t('unusualTransactionWarning', language)}
              </ThemedText>
            </View>
          </View>
        </View>
      </BlurView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContainer: {
    backgroundColor: '#0A0A0A',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#1A1A1A',
    width: '90%',
    maxWidth: 400,
    padding: 20,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  headerTitle: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '700',
  },
  closeButton: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: '#1A1A1A',
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeButtonText: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: 'bold',
  },
  stepContent: {
    alignItems: 'center',
    marginBottom: 20,
  },
  iconContainer: {
    marginBottom: 20,
  },
  plusIcon: {
    width: 120,
    height: 120,
    borderRadius: 16,
    backgroundColor: '#1A1A1A',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#2A2A2A',
  },
  plusText: {
    color: '#4A9EFF',
    fontSize: 48,
    fontWeight: 'bold',
  },
  stepTitle: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'center',
    marginBottom: 8,
  },
  stepDescription: {
    color: '#9AA0A6',
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 24,
    lineHeight: 20,
  },
  createButton: {
    backgroundColor: '#FFD700',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 12,
    minWidth: 200,
    alignItems: 'center',
  },
  createButtonText: {
    color: '#000000',
    fontSize: 16,
    fontWeight: '600',
  },
  qrContainer: {
    marginBottom: 20,
  },
  // 2번 샘플 스타일
  qrFrameOuter: { padding:0, borderRadius:18, borderWidth:8, borderColor:'#D4AF37', backgroundColor:'#000' },
  qrFrameInner: { margin:8, backgroundColor:'#fff', borderRadius:12, padding:0, borderWidth:1, borderColor:'#000' },
  centerLogoWrap: { position:'absolute', left:'50%', top:'50%', width:72, height:72, marginLeft:-36, marginTop:-36, borderRadius:14, overflow:'hidden', backgroundColor:'#000', alignItems:'center', justifyContent:'center', borderWidth:4, borderColor:'#D4AF37' },
  qrCodeFallback: {
    width: 200,
    height: 200,
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
  },
  qrCodeImage: {
    width: 200,
    height: 200,
  },
  qrLogoOverlay: {
    position: 'absolute',
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#FFD700',
  },
  qrCode: {
    width: 200,
    height: 200,
    borderRadius: 16,
    backgroundColor: '#1A1A1A',
    borderWidth: 2,
    borderColor: '#FFD700',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  qrLogo: {
    width: 40,
    height: 40,
    borderRadius: 8,
    backgroundColor: '#000000',
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoImage: {
    width: 30,
    height: 30,
  },
  addressLabel: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 8,
  },
  addressContainer: {
    width: '100%',
    alignItems: 'center',
  },
  addressText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontFamily: 'monospace',
    marginBottom: 12,
    textAlign: 'center',
  },
  copyButton: {
    backgroundColor: '#FFD700',
    paddingHorizontal: 20,
    paddingVertical: 8,
    borderRadius: 8,
  },
  copyButtonText: {
    color: '#000000',
    fontSize: 14,
    fontWeight: '600',
  },
  loadingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 16,
  },
  loadingText: {
    color: '#FFD700',
    fontSize: 14,
    marginLeft: 8,
  },
  successIcon: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#4CAF50',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  checkmark: {
    color: '#FFFFFF',
    fontSize: 36,
    fontWeight: 'bold',
  },
  doneButton: {
    backgroundColor: '#4CAF50',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 12,
    minWidth: 200,
    alignItems: 'center',
  },
  doneButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  warningSection: {
    marginTop: 20,
    paddingTop: 20,
    borderTopWidth: 1,
    borderTopColor: '#1A1A1A',
  },
  warningTitle: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 12,
  },
  warningItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  warningBullet: {
    color: '#FFB74D',
    fontSize: 14,
    marginRight: 8,
    marginTop: 2,
  },
  warningText: {
    color: '#FFFFFF',
    fontSize: 12,
    lineHeight: 16,
    flex: 1,
  },
});

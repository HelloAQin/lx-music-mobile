import { memo, useRef, useCallback } from 'react'

import { View, StyleSheet } from 'react-native'
import { PermissionsAndroid, Platform } from 'react-native'
import RNFS from 'react-native-fs'
import { pop } from '@/navigation'
import StatusBar from '@/components/common/StatusBar'
import { useTheme } from '@/store/theme/hook'
import { usePlayerMusicInfo } from '@/store/player/hook'
import Text from '@/components/common/Text'
import { scaleSizeH } from '@/utils/pixelRatio'
import { HEADER_HEIGHT as _HEADER_HEIGHT, NAV_SHEAR_NATIVE_IDS } from '@/config/constant'
import commonState from '@/store/common/state'
import SettingPopup, { type SettingPopupType } from '../../components/SettingPopup'
import { useStatusbarHeight } from '@/store/common/hook'
import Btn from './Btn'
import TimeoutExitBtn from './TimeoutExitBtn'
import { downloadFile } from '@/utils/fs'
import { toast, requestStoragePermission } from '@/utils/tools'
import { getLyricInfo } from '@/core/music'
import { getMusicUrl } from '@/core/music'
import { Alert } from 'react-native'
import { getMusicType } from '@/utils/musicSdk/utils'


export const HEADER_HEIGHT = scaleSizeH(_HEADER_HEIGHT)


const Title = () => {
  const theme = useTheme()
  const musicInfo = usePlayerMusicInfo()


  return (
    <View style={styles.titleContent}>
      <Text numberOfLines={1} style={styles.title}>{musicInfo.name}</Text>
      <Text numberOfLines={1} style={styles.title} size={12} color={theme['c-font-label']}>{musicInfo.singer}</Text>
    </View>
  )
}

export default memo(() => {
  const popupRef = useRef<SettingPopupType>(null)
  const statusBarHeight = useStatusbarHeight()
  const musicInfo = usePlayerMusicInfo()

  const back = () => {
    void pop(commonState.componentIds.playDetail!)
  }
  const showSetting = () => {
    popupRef.current?.show()
  }
    
const handleDownload = useCallback(async () => {
  if (!musicInfo) {
    toast('音乐信息不存在');
    return;
  }

  const hasPermission = await requestStoragePermission();
  if (!hasPermission) {
    toast('请先授权存储权限');
    return;
  }

  // 选择音质
  const qualityOptions = ['128k', '192k', '320k', 'flac', 'flac24bit'];
  const selectedQuality = await new Promise<string | null>((resolve) => {
    Alert.alert(
      '选择音质',
      '请选择要下载的音质',
      qualityOptions.map((quality) => ({
        text: quality,
        onPress: () => resolve(quality),
      })),
      { cancelable: true, onDismiss: () => resolve(null) }
    );
  });

  if (!selectedQuality) {
    toast('未选择音质');
    return;
  }

  try {
    if (!musicInfo.meta) {
        musicInfo.meta = {
          albumName: '',
          picUrl: '',
          _qualitys: {},
        }
      }
    const url = await getMusicUrl({ musicInfo, quality: selectedQuality, isRefresh: true });
    toast(url);
    if (!url) {
      toast('获取下载链接失败');
      return;
    }

    const musicType = getMusicType(musicInfo, selectedQuality); // 根据选择音质获取最终音质类型
    const fileName = `${musicInfo.name || '未知歌曲'}-${musicInfo.singer || '未知歌手'}-${musicType}`;
    const filePath = `${RNFS.ExternalStorageDirectoryPath}/Music/${fileName}.mp3`;

    await downloadFile(url, filePath);

    // 下载歌词
    try {
      const lyricInfo = await getLyricInfo({ musicInfo });
      if (lyricInfo && lyricInfo.lyric) {
        const lrcPath = `${RNFS.ExternalStorageDirectoryPath}/Music/${fileName}.lrc`;
        await RNFS.writeFile(lrcPath, lyricInfo.lyric, 'utf8');
        console.log('歌词保存成功:', lrcPath);
      }
    } catch (e) {
      console.error('获取歌词失败:', e);
    }

    toast('下载完成');
  } catch (err) {
    console.error('下载失败:', err);
    toast('下载失败: ' + (err instanceof Error ? err.message : String(err)));
  }
}, [musicInfo]);

  return (
    <View style={{ height: HEADER_HEIGHT + statusBarHeight, paddingTop: statusBarHeight }} nativeID={NAV_SHEAR_NATIVE_IDS.playDetail_header}>
      <StatusBar />
      <View style={styles.container}>
        <Btn icon="chevron-left" onPress={back} />
        <Title />
        <TimeoutExitBtn />
        <Btn icon="download-2" onPress={handleDownload} />
        <Btn icon="slider" onPress={showSetting} />
      </View>
      <SettingPopup ref={popupRef} direction="vertical" />
    </View>
  )
})


const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    // justifyContent: 'center',
    height: '100%',
  },
  titleContent: {
    flex: 1,
    paddingHorizontal: 5,
    // alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    // flex: 1,
    // textAlign: 'center',
  },
  icon: {
    paddingLeft: 4,
    paddingRight: 4,
  },
})

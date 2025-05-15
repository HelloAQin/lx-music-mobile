import { memo, useRef, useCallback } from 'react'

import { View, StyleSheet, Alert } from 'react-native'
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
import { QUALITYS } from '@/utils/musicSdk/utils'
import musicSdk from '@/utils/musicSdk'
import { toOldMusicInfo } from '@/utils'

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

  const showQualitySelector = useCallback(async() => {
    if (!musicInfo) {
      toast('音乐信息不存在')
      return
    }

    if (musicInfo.source == 'local') {
      toast('本地音乐无需下载')
      return
    }

    const hasPermission = await requestStoragePermission()
    if (!hasPermission) {
      toast('请先授权存储权限')
      return
    }

    try {
      // 获取完整的音乐信息
      const oldMusicInfo = toOldMusicInfo(musicInfo)
      const sdk = musicSdk[musicInfo.source]
      if (!sdk?.getMusicInfo) {
        toast('不支持的音乐源')
        return
      }

      let fullMusicInfo
      if (musicInfo.source === 'kw') {
        // 酷我需要特殊处理
        const result = await sdk.getMusicInfo(oldMusicInfo).promise
        fullMusicInfo = result
      } else {
        // 咪咕和酷狗可以直接获取
        fullMusicInfo = await sdk.getMusicInfo(oldMusicInfo)
      }

      if (!fullMusicInfo?.types?.length) {
        toast('没有可用的音质')
        return
      }

      const qualityItems = fullMusicInfo.types.map(quality => ({
        text: `${quality.type} (${quality.size || '未知大小'})`,
        onPress: () => handleDownload(quality.type)
      }))

      Alert.alert(
        '选择下载音质',
        '请选择要下载的音质',
        qualityItems,
        { cancelable: true }
      )
    } catch (err) {
      console.error(err)
      toast('获取音质信息失败')
    }
  }, [musicInfo])
    
  const handleDownload = useCallback(async(quality: string) => {
    if (!musicInfo) {
      toast('音乐信息不存在')
      return
    }

    try {
      console.log('开始下载，音乐信息:', musicInfo)
      const url = await getMusicUrl({ musicInfo, isRefresh: true, quality })
      if (!url) {
        toast('获取下载链接失败')
        return
      }
      const fileName = `${musicInfo.name || '未知歌曲'}-${musicInfo.singer || '未知歌手'}`
      const mp3Path = `${RNFS.ExternalStorageDirectoryPath}/Music/${fileName}.${quality.includes('flac') ? 'flac' : 'mp3'}`
      await downloadFile(url, mp3Path)
      toast('下载完成: ' + mp3Path)
      
      // 下载歌词
      try {
        const lyricInfo = await getLyricInfo({ musicInfo })
        if (lyricInfo && lyricInfo.lyric) {
          const lrcPath = `${RNFS.ExternalStorageDirectoryPath}/Music/${fileName}.lrc`
          try {
            await RNFS.writeFile(lrcPath, lyricInfo.lyric, 'utf8')
            console.log('歌词保存成功:', lrcPath)
          } catch (e) {
            console.error('歌词保存失败:', e)
          }
        }
      } catch (e) {
        console.error('获取歌词失败:', e)
        // 歌词获取失败不影响主流程
      }
      toast('下载完成')
    } catch (err) {
      console.error('下载失败:', err)
      toast('下载失败: ' + (err instanceof Error ? err.message : String(err)))
    }
  }, [musicInfo])

  return (
    <View style={{ height: HEADER_HEIGHT + statusBarHeight, paddingTop: statusBarHeight }} nativeID={NAV_SHEAR_NATIVE_IDS.playDetail_header}>
      <StatusBar />
      <View style={styles.container}>
        <Btn icon="chevron-left" onPress={back} />
        <Title />
        <TimeoutExitBtn />
        <Btn icon="download-2" onPress={showQualitySelector} />
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

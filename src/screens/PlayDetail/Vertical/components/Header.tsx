import { memo, useRef, useCallback } from 'react'

import { View, StyleSheet } from 'react-native'
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
import { Dirs } from 'react-native-file-system'
import { toast } from '@/utils/tools'
import { getLyricInfo } from '@/core/music'
import { getMusicUrl } from '@/core/music'

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
    if (!musicInfo) return
    try {
      const url = await getMusicUrl({ musicInfo, isRefresh: true })
      if (!url) {
        toast('获取下载链接失败')
        return
      }
      toast(url)
      const fileName = `${musicInfo.singer} - ${musicInfo.name}`
      const mp3Path = `${Dirs.DocumentDir}/${fileName}.mp3`
      await downloadFile(url, mp3Path)
      // 下载歌词
      try {
        const lyricInfo = await getLyricInfo({ musicInfo })
        if (lyricInfo && lyricInfo.lyric) {
          const lrcPath = `${Dirs.DocumentDir}/${fileName}.lrc`
          try {
            await RNFS.writeFile(lrcPath, lyricInfo.lyric, 'utf8')
            console.log('歌词保存成功:', lrcPath)
          } catch (e) {
            console.error('歌词保存失败:', e)
          }
        }
      } catch (e) {
        // 歌词获取失败不影响主流程
      }
      toast('下载完成')
    } catch (err) {
      console.error('下载失败:', err)
      toast('下载失败' + err)
    }
  }, [musicInfo])

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

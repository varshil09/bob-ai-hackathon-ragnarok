# ==============================================================================
# APP.PY: BOB-POWERED FIR INTELLIGENCE DASHBOARD (STREAMLIT)
# ==============================================================================

import streamlit as st
import pandas as pd
import matplotlib.pyplot as plt
import seaborn as sns

# Page Configuration
st.set_page_config(
    page_title="FIR Intelligence & Crime Pattern Detector",
    page_icon="🚨",
    layout="wide"
)

# Load Dataset
@st.cache_data
def load_data():
    df = pd.read_csv('FIR DATASET.csv')
    df['accused_name'] = df['accused_name'].fillna('Unknown')
    df['linked_phone'] = df['linked_phone'].fillna('Not applicable')
    return df

df = load_data()

# Sidebar Navigation
st.sidebar.title("🚨 Bob Intelligence Hub")
st.sidebar.markdown("---")
nav_option = st.sidebar.radio(
    "Select Intelligence View:",
    ["📊 Executive Dashboard", "🏢 Station Operational Briefing", "🔍 Cross-District Syndicate Tracker"]
)

# ------------------------------------------------------------------------------
# VIEW 1: EXECUTIVE DASHBOARD
# ------------------------------------------------------------------------------
if nav_option == "📊 Executive Dashboard":
    st.title("🚨 CCTNS FIR Intelligence & Crime Pattern Detector")
    st.markdown("Automated NLP layer bridging legacy police archives to surface cross-district syndicates.")

    col1, col2, col3, col4 = st.columns(4)
    col1.metric("Total Digitized FIRs", f"{len(df):,}")
    col2.metric("Districts Monitored", f"{df['district'].nunique()}")
    col3.metric("Police Stations", f"{df['police_station'].nunique()}")
    col4.metric("High-Risk Cases", f"{(df['case_priority'] == 'High').sum()}")

    st.markdown("---")

    # Crime Type Distribution Chart
    st.subheader("📈 Crime Category Breakdown Across Jurisdictions")
    fig, ax = plt.subplots(figsize=(10, 4))
    sns.countplot(data=df, y='crime_type', order=df['crime_type'].value_counts().index, palette='crest', ax=ax)
    ax.set_xlabel("Number of FIRs")
    ax.set_ylabel("Crime Type")
    st.pyplot(fig)

# ------------------------------------------------------------------------------
# VIEW 2: STATION OPERATIONAL BRIEFING
# ------------------------------------------------------------------------------
elif nav_option == "🏢 Station Operational Briefing":
    st.title("🤖 Bob's Station-Level Morning Parade Briefing")
    st.markdown("Select a police station to generate an automated operational intelligence report for the SHO.")

    selected_station = st.selectbox("Choose Police Station:", sorted(df['police_station'].unique()))

    station_df = df[df['police_station'].str.lower() == selected_station.lower()]

    if not station_df.empty:
        district = station_df['district'].iloc[0]
        state = station_df['state'].iloc[0]

        st.info(f"**Jurisdiction:** {selected_station} | **District:** {district} ({state})")

        col1, col2, col3 = st.columns(3)
        col1.metric("Active Case Load", len(station_df))
        col2.metric("High-Risk FIRs", int((station_df['case_priority'] == 'High').sum()))
        col3.metric("Pending Investigations", int((station_df['investigation_status'] == 'Under Investigation').sum()))

        st.markdown("### 📋 Crime Breakdown in Station Area")
        st.write(station_df['crime_type'].value_counts())

        st.markdown("### ⚠️ Flagged Repeat Offenders Linked to Station")
        station_suspects = station_df[~station_df['accused_name'].str.contains('Unknown', case=False, na=False)]['accused_name'].unique()

        if len(station_suspects) > 0:
            offenders_data = []
            for name in station_suspects:
                suspect_records = df[df['accused_name'] == name]
                offenders_data.append({
                    "Accused Name": name,
                    "Total State FIRs": len(suspect_records),
                    "Districts Spanned": ", ".join(suspect_records['district'].unique()),
                    "Threat Level": "HIGH (Syndicate)" if len(suspect_records['district'].unique()) > 1 else "MEDIUM"
                })
            st.dataframe(pd.DataFrame(offenders_data), use_container_width=True)
        else:
            st.success("No named repeat offenders found in this station's current active batch.")

# ------------------------------------------------------------------------------
# VIEW 3: CROSS-DISTRICT SYNDICATE TRACKER
# ------------------------------------------------------------------------------
elif nav_option == "🔍 Cross-District Syndicate Tracker":
    st.title("🕸️ Inter-District Gang & Syndicate Linkage (Jamtara Pattern Detector)")
    st.markdown("Surfaces suspects and shared digital handles (Phone numbers / UPI IDs) operating across multiple jurisdictions.")

    valid_accused = df[~df['accused_name'].str.contains('Unknown', case=False, na=False)]
    repeat_suspects = valid_accused['accused_name'].value_counts()
    multi_district_gangs = repeat_suspects[repeat_suspects > 1]

    st.subheader("🚨 Top Cross-District Repeat Suspects")
    st.write(f"Found **{len(multi_district_gangs)}** suspects operating across multiple FIR files.")

    syndicate_table = []
    for name, count in multi_district_gangs.items():
        records = df[df['accused_name'] == name]
        syndicate_table.append({
            "Accused Name": name,
            "Total FIR Count": count,
            "Districts Involved": ", ".join(records['district'].unique()),
            "Crime Types": ", ".join(records['crime_type'].unique())
        })

    st.dataframe(pd.DataFrame(syndicate_table), use_container_width=True)